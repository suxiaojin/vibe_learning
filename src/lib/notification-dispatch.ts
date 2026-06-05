import type { NotificationAutomationEventType, Prisma } from "@prisma/client";
import { expireDueBuddyRequests } from "@/lib/buddies";
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
            occurredAt: current.occurredAt,
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
                status: "pending",
                templateId: rule.templateId,
                automationRuleId: rule.id,
                eventId: current.id,
                authorId: rule.createdById,
                titleSnapshot: renderTemplate(rule.template.title, variables, false),
                contentHtmlSnapshot: renderTemplate(rule.template.contentHtml, variables, true),
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

  const recipientIds = Array.from(new Set(
    job.recipients
      .filter((recipient) => recipient.user?.status === "active")
      .map((recipient) => recipient.user?.id)
      .filter((id): id is string => Boolean(id))
  ));
  if (recipientIds.length === 0) {
    throw new Error("没有可接收通知的正常学生账号。");
  }

  const sentAt = new Date();
  await prisma.$transaction(async (tx) => {
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
          create: recipientIds.map((userId) => ({
            userId,
            deliveredAt: sentAt
          }))
        }
      },
      select: { id: true }
    });

    await tx.notificationDispatchJob.update({
      where: { id: job.id },
      data: {
        notificationId: notification.id,
        status: "sent",
        sentAt,
        failedAt: null,
        lastError: null
      }
    });
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
  base: { occurredAt: Date; username: string }
) {
  const variables: Record<string, string> = {
    occurredAt: formatDateTime(base.occurredAt),
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

function renderTemplate(template: string, variables: Record<string, string>, escapeValues: boolean) {
  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key: string) => {
    const value = variables[key] || "";
    return escapeValues ? escapeHtml(value) : value;
  });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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
