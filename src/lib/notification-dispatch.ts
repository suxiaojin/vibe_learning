import type { NotificationAutomationEventType, Prisma } from "@prisma/client";
import { expireDueBuddyRequests } from "@/lib/buddies";
import { isValidEmail, normalizeEmail, sendNotificationEmail } from "@/lib/email-verification";
import {
  hasNotificationTemplateVariables,
  renderNotificationTemplateHtml,
  renderNotificationTemplateText
} from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

const staleProcessingMinutes = 10;
const retryBaseSeconds = 30;

type NotificationEventInput = {
  type: NotificationAutomationEventType;
  eventKey: string;
  userId?: string | null;
  payload?: Prisma.InputJsonValue;
  occurredAt?: Date;
};

export async function createNotificationEvent(tx: Prisma.TransactionClient, input: NotificationEventInput) {
  return tx.notificationEvent.upsert({
    where: { eventKey: input.eventKey },
    update: {},
    create: {
      type: input.type,
      eventKey: input.eventKey,
      userId: input.userId || null,
      payload: input.payload,
      occurredAt: input.occurredAt || new Date()
    }
  });
}

export async function processNotificationEvents(limit = 25) {
  const events = await prisma.notificationEvent.findMany({
    where: { processedAt: null },
    orderBy: { occurredAt: "asc" },
    take: limit,
    select: { id: true }
  });

  let processed = 0;
  for (const event of events) {
    try {
      await prisma.$transaction(async (tx) => {
        const current = await tx.notificationEvent.findUnique({
          where: { id: event.id },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                username: true,
                status: true,
                studentProfile: {
                  select: {
                    major: { select: { name: true } },
                    region: { select: { province: true, studySystem: true } }
                  }
                }
              }
            }
          }
        });
        if (!current || current.processedAt) {
          return;
        }

        const rules = await tx.notificationAutomationRule.findMany({
          where: {
            enabled: true,
            eventType: current.type
          },
          include: { template: true }
        });
        const user = current.user;

        if (user?.status === "active") {
          const variables = buildTemplateVariables(current.payload, {
            email: user.email || "",
            majorName: user.studentProfile?.major?.name || "",
            occurredAt: current.occurredAt,
            province: user.studentProfile?.region?.province || "",
            studySystem: user.studentProfile?.region?.studySystem || "",
            username: user.username
          });

          for (const rule of rules) {
            const scheduledAt = new Date(current.occurredAt.getTime() + rule.delayMinutes * 60 * 1000);
            await tx.notificationDispatchJob.upsert({
              where: {
                automationRuleId_eventId: {
                  automationRuleId: rule.id,
                  eventId: current.id
                }
              },
              update: {},
              create: {
                type: "automated",
                channel: rule.channel,
                status: "pending",
                templateId: rule.templateId,
                automationRuleId: rule.id,
                eventId: current.id,
                authorId: rule.createdById,
                titleSnapshot: renderNotificationTemplateText(rule.template.title, variables),
                contentHtmlSnapshot: renderNotificationTemplateHtml(rule.template.contentHtml, variables),
                audienceSnapshot: {
                  eventType: current.type,
                  ruleName: rule.name,
                  source: "automation_event"
                },
                scheduledAt,
                recipients: {
                  create: {
                    userId: user.id,
                    usernameSnapshot: user.username,
                    emailSnapshot: user.email,
                    provinceSnapshot: user.studentProfile?.region?.province || null,
                    studySystemSnapshot: user.studentProfile?.region?.studySystem || null,
                    majorNameSnapshot: user.studentProfile?.major?.name || null
                  }
                }
              }
            });
          }
        }

        await tx.notificationEvent.update({
          where: { id: current.id },
          data: {
            processedAt: new Date(),
            attemptCount: { increment: 1 },
            lastError: null
          }
        });
      });
      processed += 1;
    } catch (error) {
      await prisma.notificationEvent.update({
        where: { id: event.id },
        data: {
          attemptCount: { increment: 1 },
          lastError: getErrorMessage(error)
        }
      }).catch(() => undefined);
    }
  }

  return processed;
}

export async function processDueNotificationJobs(limit = 25) {
  const staleBefore = new Date(Date.now() - staleProcessingMinutes * 60 * 1000);
  await prisma.notificationDispatchJob.updateMany({
    where: {
      status: "processing",
      startedAt: { lt: staleBefore }
    },
    data: {
      status: "pending",
      startedAt: null,
      lastError: "任务执行超时，已自动重新排队。"
    }
  });

  const dueJobs = await prisma.notificationDispatchJob.findMany({
    where: {
      status: "pending",
      scheduledAt: { lte: new Date() }
    },
    orderBy: { scheduledAt: "asc" },
    take: limit,
    select: { id: true }
  });

  let processed = 0;
  for (const dueJob of dueJobs) {
    const claimed = await prisma.notificationDispatchJob.updateMany({
      where: {
        id: dueJob.id,
        status: "pending"
      },
      data: {
        status: "processing",
        startedAt: new Date(),
        attemptCount: { increment: 1 }
      }
    });
    if (claimed.count !== 1) {
      continue;
    }

    try {
      await executeNotificationDispatchJob(dueJob.id);
      processed += 1;
    } catch (error) {
      await handleDispatchFailure(dueJob.id, error);
    }
  }

  return processed;
}

export async function runNotificationWorkerCycle() {
  const events = await processNotificationEvents();
  const jobs = await processDueNotificationJobs();
  const buddyRequests = await expireDueBuddyRequests();
  return { events, jobs, buddyRequests };
}

async function executeNotificationDispatchJob(jobId: string) {
  const job = await prisma.notificationDispatchJob.findUniqueOrThrow({
    where: { id: jobId },
    include: {
      recipients: {
        include: {
          user: { select: { id: true, status: true } }
        }
      }
    }
  });

  if (job.status !== "processing") {
    return;
  }

  if (job.channel === "email") {
    await executeEmailDispatchJob(job);
    return;
  }

  await executeInAppDispatchJob(job);
}

async function executeInAppDispatchJob(job: Awaited<ReturnType<typeof loadDispatchJob>>) {
  if (!job) {
    return;
  }

  const activeRecipients = Array.from(
    job.recipients.reduce((recipients, recipient) => {
      if (recipient.user?.status === "active") {
        recipients.set(recipient.user.id, recipient);
      }
      return recipients;
    }, new Map<string, (typeof job.recipients)[number]>()).values()
  );
  if (activeRecipients.length === 0) {
    throw new Error("没有可接收通知的正常学生账号。");
  }

  const sentAt = new Date();
  await prisma.$transaction(async (tx) => {
    const personalized = job.type === "scheduled" && (
      hasNotificationTemplateVariables(job.titleSnapshot)
      || hasNotificationTemplateVariables(job.contentHtmlSnapshot)
    );
    const notificationIds: string[] = [];

    if (personalized) {
      for (const recipient of activeRecipients) {
        const variables = {
          majorName: recipient.majorNameSnapshot || "",
          province: recipient.provinceSnapshot || "",
          studySystem: recipient.studySystemSnapshot || "",
          username: recipient.usernameSnapshot
        };
        const notification = await tx.notification.create({
          data: {
            title: renderNotificationTemplateText(job.titleSnapshot, variables),
            contentHtml: renderNotificationTemplateHtml(job.contentHtmlSnapshot, variables),
            status: "sent",
            source: "scheduled",
            authorId: job.authorId,
            sentAt,
            expiresAt: null,
            recipients: {
              create: {
                userId: recipient.user!.id,
                deliveredAt: sentAt
              }
            }
          },
          select: { id: true }
        });
        notificationIds.push(notification.id);
      }
    } else {
      const notification = await tx.notification.create({
        data: {
          title: job.titleSnapshot,
          contentHtml: job.contentHtmlSnapshot,
          status: "sent",
          source: job.type === "scheduled" ? "scheduled" : "automated",
          authorId: job.authorId,
          sentAt,
          expiresAt: null,
          recipients: {
            create: activeRecipients.map((recipient) => ({
              userId: recipient.user!.id,
              deliveredAt: sentAt
            }))
          }
        },
        select: { id: true }
      });
      notificationIds.push(notification.id);
    }

    await tx.notificationDispatchJob.update({
      where: { id: job.id },
      data: {
        notificationId: notificationIds[0],
        status: "sent",
        sentAt,
        failedAt: null,
        lastError: null
      }
    });

    await tx.notificationDispatchRecipient.updateMany({
      where: { jobId: job.id },
      data: {
        deliveryStatus: "sent",
        deliveredAt: sentAt,
        failedAt: null,
        deliveryLastError: null
      }
    });
  });
}

async function executeEmailDispatchJob(job: Awaited<ReturnType<typeof loadDispatchJob>>) {
  if (!job) {
    return;
  }

  const remainingRecipients = job.recipients.filter((recipient) =>
    recipient.deliveryStatus !== "sent" && recipient.deliveryStatus !== "skipped"
  );
  const failures: string[] = [];

  for (const recipient of remainingRecipients) {
    if (recipient.user?.status !== "active") {
      await markEmailRecipientSkipped(recipient.id, "学生账号不存在或不是正常状态。");
      continue;
    }

    const email = normalizeEmail(recipient.emailSnapshot || "");
    if (!isValidEmail(email)) {
      await markEmailRecipientSkipped(recipient.id, "学生没有可用的邮箱地址。");
      continue;
    }

    const variables = {
      email,
      majorName: recipient.majorNameSnapshot || "",
      province: recipient.provinceSnapshot || "",
      studySystem: recipient.studySystemSnapshot || "",
      username: recipient.usernameSnapshot
    };

    try {
      await sendNotificationEmail({
        email,
        subject: renderNotificationTemplateText(job.titleSnapshot, variables),
        html: renderNotificationTemplateHtml(job.contentHtmlSnapshot, variables)
      });
      await prisma.notificationDispatchRecipient.update({
        where: { id: recipient.id },
        data: {
          deliveryStatus: "sent",
          deliveredAt: new Date(),
          failedAt: null,
          deliveryAttemptCount: { increment: 1 },
          deliveryLastError: null
        }
      });
    } catch (error) {
      const message = getErrorMessage(error);
      failures.push(`${recipient.usernameSnapshot}: ${message}`);
      await prisma.notificationDispatchRecipient.update({
        where: { id: recipient.id },
        data: {
          deliveryStatus: "failed",
          failedAt: new Date(),
          deliveryAttemptCount: { increment: 1 },
          deliveryLastError: message
        }
      });
    }
  }

  if (failures.length > 0) {
    throw new Error(failures.join("；").slice(0, 2000));
  }

  await prisma.notificationDispatchJob.update({
    where: { id: job.id },
    data: {
      status: "sent",
      sentAt: new Date(),
      failedAt: null,
      lastError: null
    }
  });
}

async function loadDispatchJob(jobId: string) {
  return prisma.notificationDispatchJob.findUnique({
    where: { id: jobId },
    include: {
      recipients: {
        include: {
          user: { select: { id: true, status: true } }
        }
      }
    }
  });
}

async function markEmailRecipientSkipped(id: string, reason: string) {
  await prisma.notificationDispatchRecipient.update({
    where: { id },
    data: {
      deliveryStatus: "skipped",
      failedAt: new Date(),
      deliveryAttemptCount: { increment: 1 },
      deliveryLastError: reason
    }
  });
}

async function handleDispatchFailure(jobId: string, error: unknown) {
  const job = await prisma.notificationDispatchJob.findUnique({
    where: { id: jobId },
    select: { attemptCount: true, maxAttempts: true }
  });
  if (!job) {
    return;
  }

  const failed = job.attemptCount >= job.maxAttempts;
  const retryDelaySeconds = Math.min(5 * 60, retryBaseSeconds * Math.max(job.attemptCount, 1));
  await prisma.notificationDispatchJob.update({
    where: { id: jobId },
    data: {
      status: failed ? "failed" : "pending",
      scheduledAt: failed ? undefined : new Date(Date.now() + retryDelaySeconds * 1000),
      startedAt: null,
      failedAt: failed ? new Date() : null,
      lastError: getErrorMessage(error)
    }
  });
}

function buildTemplateVariables(
  payload: Prisma.JsonValue | null,
  base: {
    email: string;
    majorName: string;
    occurredAt: Date;
    province: string;
    studySystem: string;
    username: string;
  }
) {
  const variables: Record<string, string> = {
    email: base.email,
    majorName: base.majorName,
    occurredAt: formatDateTime(base.occurredAt),
    province: base.province,
    studySystem: base.studySystem,
    username: base.username
  };
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    Object.entries(payload).forEach(([key, value]) => {
      if (value === null || value === undefined) {
        variables[key] = "";
      } else if (typeof value === "object") {
        variables[key] = JSON.stringify(value);
      } else {
        variables[key] = String(value);
      }
    });
  }
  return variables;
}

function getErrorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 2000);
}

function formatDateTime(date: Date) {
  return date.toLocaleString("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Shanghai",
    year: "numeric"
  });
}
