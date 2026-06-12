"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { isValidEmail, normalizeEmail } from "@/lib/email-verification";
import {
  hasNotificationTemplateVariables,
  notificationHtmlMaxChars,
  renderNotificationTemplateHtml,
  renderNotificationTemplateText,
  sanitizeNotificationHtml,
  stripNotificationHtml
} from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

type NotificationTab = "email" | "records" | "send" | "templates";
const automationEventTypes = new Set(["user_registered", "admin_diamond_added", "diamond_purchase_succeeded"]);

function buildAdminNotificationsRedirect(
  tab: NotificationTab,
  key: "notice" | "error",
  value: string,
  additional?: Record<string, string>
) {
  const params = new URLSearchParams({ tab, [key]: value, ...additional });
  return `/admin/notifications?${params.toString()}`;
}

function getRecipientIds(formData: FormData) {
  return Array.from(new Set(formData.getAll("recipientIds").map((item) => String(item).trim()).filter(Boolean)));
}

function getNotificationContent(formData: FormData) {
  const rawContentHtml = String(formData.get("contentHtml") || "");
  if (rawContentHtml.length > notificationHtmlMaxChars) {
    return { contentHtml: "", error: "content-too-large" };
  }
  const contentHtml = sanitizeNotificationHtml(rawContentHtml);
  return {
    contentHtml,
    error: stripNotificationHtml(contentHtml) ? "" : "content-required"
  };
}

function revalidateNotificationPaths() {
  revalidatePath("/admin/notifications");
  revalidatePath("/learn");
  revalidatePath("/notifications");
}

export async function sendNotification(formData: FormData) {
  const admin = await requireAdmin();
  const title = String(formData.get("title") || "").trim().slice(0, 120);
  const { contentHtml, error } = getNotificationContent(formData);
  const recipientIds = getRecipientIds(formData);

  if (!title) {
    redirect(buildAdminNotificationsRedirect("send", "error", "title-required"));
  }
  if (error) {
    redirect(buildAdminNotificationsRedirect("send", "error", error));
  }
  if (recipientIds.length === 0) {
    redirect(buildAdminNotificationsRedirect("send", "error", "recipients-required"));
  }

  const recipients = await prisma.user.findMany({
    where: {
      id: { in: recipientIds },
      role: "student",
      status: "active"
    },
    select: { id: true, username: true }
  });

  if (recipients.length === 0) {
    redirect(buildAdminNotificationsRedirect("send", "error", "recipients-unavailable"));
  }

  const now = new Date();
  const personalized = hasNotificationTemplateVariables(title) || hasNotificationTemplateVariables(contentHtml);
  if (personalized) {
    await prisma.$transaction(
      recipients.map((recipient) => {
        const variables = { username: recipient.username };
        return prisma.notification.create({
          data: {
            title: renderNotificationTemplateText(title, variables),
            contentHtml: renderNotificationTemplateHtml(contentHtml, variables),
            status: "sent",
            source: "manual",
            authorId: admin.id,
            sentAt: now,
            expiresAt: null,
            recipients: {
              create: {
                userId: recipient.id,
                deliveredAt: now
              }
            }
          }
        });
      })
    );
  } else {
    await prisma.notification.create({
      data: {
        title,
        contentHtml,
        status: "sent",
        source: "manual",
        authorId: admin.id,
        sentAt: now,
        expiresAt: null,
        recipients: {
          create: recipients.map((recipient) => ({
            userId: recipient.id,
            deliveredAt: now
          }))
        }
      }
    });
  }

  revalidateNotificationPaths();
  redirect(buildAdminNotificationsRedirect("send", "notice", "sent", { count: String(recipients.length) }));
}

export async function sendEmailNotification(formData: FormData) {
  const admin = await requireAdmin();
  const title = String(formData.get("title") || "").trim().slice(0, 120);
  const { contentHtml, error } = getNotificationContent(formData);
  const recipientIds = getRecipientIds(formData);

  if (!title) {
    redirect(buildAdminNotificationsRedirect("email", "error", "title-required"));
  }
  if (error) {
    redirect(buildAdminNotificationsRedirect("email", "error", error));
  }
  if (recipientIds.length === 0) {
    redirect(buildAdminNotificationsRedirect("email", "error", "recipients-required"));
  }

  const recipients = await findDispatchRecipients(recipientIds, true);
  if (recipients.length === 0) {
    redirect(buildAdminNotificationsRedirect("email", "error", "email-recipients-unavailable"));
  }

  await prisma.notificationDispatchJob.create({
    data: {
      type: "immediate",
      channel: "email",
      status: "pending",
      authorId: admin.id,
      titleSnapshot: title,
      contentHtmlSnapshot: contentHtml,
      audienceSnapshot: {
        createdFrom: "admin_email_send",
        recipientCount: recipients.length
      },
      scheduledAt: new Date(),
      recipients: { create: recipients.map(toDispatchRecipientSnapshot) }
    }
  });

  revalidatePath("/admin/notifications");
  redirect(buildAdminNotificationsRedirect("email", "notice", "email-queued", { count: String(recipients.length) }));
}

export async function scheduleNotification(formData: FormData) {
  const admin = await requireAdmin();
  const templateId = String(formData.get("templateId") || "").trim();
  const scheduledAt = parseBeijingDateTime(String(formData.get("scheduledAt") || ""));
  const recipientIds = getRecipientIds(formData);

  if (!templateId) {
    redirect(buildAdminNotificationsRedirect("send", "error", "template-required", { mode: "scheduled" }));
  }
  if (!scheduledAt || scheduledAt.getTime() <= Date.now()) {
    redirect(buildAdminNotificationsRedirect("send", "error", "scheduled-time-invalid", { mode: "scheduled" }));
  }
  if (recipientIds.length === 0) {
    redirect(buildAdminNotificationsRedirect("send", "error", "recipients-required", { mode: "scheduled" }));
  }

  const [template, recipients] = await Promise.all([
    prisma.notificationTemplate.findUnique({ where: { id: templateId } }),
    prisma.user.findMany({
      where: {
        id: { in: recipientIds },
        role: "student",
        status: "active"
      },
      select: {
        id: true,
        username: true,
        studentProfile: {
          select: {
            major: { select: { name: true } },
            region: { select: { province: true, studySystem: true } }
          }
        }
      }
    })
  ]);

  if (!template) {
    redirect(buildAdminNotificationsRedirect("send", "error", "template-unavailable", { mode: "scheduled" }));
  }
  if (recipients.length === 0) {
    redirect(buildAdminNotificationsRedirect("send", "error", "recipients-unavailable", { mode: "scheduled" }));
  }

  await prisma.notificationDispatchJob.create({
    data: {
      type: "scheduled",
      channel: "in_app",
      status: "pending",
      templateId: template.id,
      authorId: admin.id,
      titleSnapshot: template.title,
      contentHtmlSnapshot: template.contentHtml,
      audienceSnapshot: {
        createdFrom: "admin_notification_send",
        recipientCount: recipients.length
      },
      scheduledAt,
      recipients: {
        create: recipients.map((recipient) => ({
          userId: recipient.id,
          usernameSnapshot: recipient.username,
          provinceSnapshot: recipient.studentProfile?.region?.province || null,
          studySystemSnapshot: recipient.studentProfile?.region?.studySystem || null,
          majorNameSnapshot: recipient.studentProfile?.major?.name || null
        }))
      }
    }
  });

  revalidatePath("/admin/notifications");
  redirect(buildAdminNotificationsRedirect("send", "notice", "scheduled", {
    count: String(recipients.length),
    mode: "scheduled"
  }));
}

export async function scheduleEmailNotification(formData: FormData) {
  const admin = await requireAdmin();
  const templateId = String(formData.get("templateId") || "").trim();
  const scheduledAt = parseBeijingDateTime(String(formData.get("scheduledAt") || ""));
  const recipientIds = getRecipientIds(formData);

  if (!templateId) {
    redirect(buildAdminNotificationsRedirect("email", "error", "template-required", { mode: "scheduled" }));
  }
  if (!scheduledAt || scheduledAt.getTime() <= Date.now()) {
    redirect(buildAdminNotificationsRedirect("email", "error", "scheduled-time-invalid", { mode: "scheduled" }));
  }
  if (recipientIds.length === 0) {
    redirect(buildAdminNotificationsRedirect("email", "error", "recipients-required", { mode: "scheduled" }));
  }

  const [template, recipients] = await Promise.all([
    prisma.notificationTemplate.findUnique({ where: { id: templateId } }),
    findDispatchRecipients(recipientIds, true)
  ]);

  if (!template) {
    redirect(buildAdminNotificationsRedirect("email", "error", "template-unavailable", { mode: "scheduled" }));
  }
  if (recipients.length === 0) {
    redirect(buildAdminNotificationsRedirect("email", "error", "email-recipients-unavailable", { mode: "scheduled" }));
  }

  await prisma.notificationDispatchJob.create({
    data: {
      type: "scheduled",
      channel: "email",
      status: "pending",
      templateId: template.id,
      authorId: admin.id,
      titleSnapshot: template.title,
      contentHtmlSnapshot: template.contentHtml,
      audienceSnapshot: {
        createdFrom: "admin_email_send",
        recipientCount: recipients.length
      },
      scheduledAt,
      recipients: { create: recipients.map(toDispatchRecipientSnapshot) }
    }
  });

  revalidatePath("/admin/notifications");
  redirect(buildAdminNotificationsRedirect("email", "notice", "email-scheduled", {
    count: String(recipients.length),
    mode: "scheduled"
  }));
}

export async function cancelScheduledNotification(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  await prisma.notificationDispatchJob.updateMany({
    where: {
      id,
      type: "scheduled",
      channel: "in_app",
      status: { in: ["pending", "failed"] }
    },
    data: {
      status: "cancelled",
      cancelledAt: new Date()
    }
  });
  revalidatePath("/admin/notifications");
  redirect(buildAdminNotificationsRedirect("send", "notice", "schedule-cancelled", { mode: "scheduled" }));
}

export async function cancelScheduledEmail(formData: FormData) {
  await cancelDispatchJob(formData, "email");
}

export async function rescheduleNotification(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  const scheduledAt = parseBeijingDateTime(String(formData.get("scheduledAt") || ""));
  if (!scheduledAt || scheduledAt.getTime() <= Date.now()) {
    redirect(buildAdminNotificationsRedirect("send", "error", "scheduled-time-invalid", { mode: "scheduled" }));
  }
  await prisma.notificationDispatchJob.updateMany({
    where: {
      id,
      type: "scheduled",
      channel: "in_app",
      status: { in: ["pending", "failed", "cancelled"] }
    },
    data: {
      status: "pending",
      scheduledAt,
      cancelledAt: null,
      failedAt: null,
      startedAt: null,
      attemptCount: 0,
      lastError: null
    }
  });
  revalidatePath("/admin/notifications");
  redirect(buildAdminNotificationsRedirect("send", "notice", "schedule-updated", { mode: "scheduled" }));
}

export async function rescheduleEmailNotification(formData: FormData) {
  await rescheduleDispatchJob(formData, "email");
}

export async function saveNotificationTemplate(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") || "").trim();
  const name = String(formData.get("name") || "").trim().slice(0, 80);
  const title = String(formData.get("title") || "").trim().slice(0, 120);
  const { contentHtml, error } = getNotificationContent(formData);

  if (!name) {
    redirect(buildAdminNotificationsRedirect("templates", "error", "template-name-required"));
  }
  if (!title) {
    redirect(buildAdminNotificationsRedirect("templates", "error", "title-required"));
  }
  if (error) {
    redirect(buildAdminNotificationsRedirect("templates", "error", error));
  }

  if (id) {
    await prisma.notificationTemplate.update({
      where: { id },
      data: {
        name,
        title,
        contentHtml,
        authorId: admin.id
      }
    });
  } else {
    await prisma.notificationTemplate.create({
      data: {
        name,
        title,
        contentHtml,
        authorId: admin.id
      }
    });
  }

  revalidatePath("/admin/notifications");
  redirect(buildAdminNotificationsRedirect("templates", "notice", id ? "template-updated" : "template-created"));
}

export async function deleteNotificationTemplate(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") || "").trim();
  await prisma.notificationTemplate.delete({ where: { id } });
  revalidatePath("/admin/notifications");
  redirect(buildAdminNotificationsRedirect("templates", "notice", "template-deleted"));
}

export async function createNotificationAutomationRule(formData: FormData) {
  await createAutomationRule(formData, "in_app");
}

export async function createEmailAutomationRule(formData: FormData) {
  await createAutomationRule(formData, "email");
}

async function createAutomationRule(formData: FormData, channel: "email" | "in_app") {
  const admin = await requireAdmin();
  const tab: NotificationTab = channel === "email" ? "email" : "send";
  const name = String(formData.get("name") || "").trim().slice(0, 100);
  const eventType = String(formData.get("eventType") || "");
  const templateId = String(formData.get("templateId") || "");
  const delayMinutes = Number(formData.get("delayMinutes") || 0);

  if (!name) {
    redirect(buildAdminNotificationsRedirect(tab, "error", "automation-name-required", { mode: "automated" }));
  }
  if (!automationEventTypes.has(eventType)) {
    redirect(buildAdminNotificationsRedirect(tab, "error", "automation-event-required", { mode: "automated" }));
  }
  if (!templateId) {
    redirect(buildAdminNotificationsRedirect(tab, "error", "template-required", { mode: "automated" }));
  }
  if (!Number.isInteger(delayMinutes) || delayMinutes < 0 || delayMinutes > 10080) {
    redirect(buildAdminNotificationsRedirect(tab, "error", "automation-delay-invalid", { mode: "automated" }));
  }

  await prisma.notificationTemplate.findUniqueOrThrow({ where: { id: templateId }, select: { id: true } });
  await prisma.notificationAutomationRule.create({
    data: {
      name,
      eventType: eventType as "user_registered" | "admin_diamond_added" | "diamond_purchase_succeeded",
      channel,
      templateId,
      delayMinutes,
      enabled: formData.get("enabled") === "on",
      createdById: admin.id
    }
  });
  revalidatePath("/admin/notifications");
  redirect(buildAdminNotificationsRedirect(tab, "notice", "automation-created", { mode: "automated" }));
}

export async function toggleNotificationAutomationRule(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  const rule = await prisma.notificationAutomationRule.findUniqueOrThrow({
    where: { id },
    select: { channel: true, enabled: true }
  });
  await prisma.notificationAutomationRule.update({
    where: { id },
    data: { enabled: !rule.enabled }
  });
  revalidatePath("/admin/notifications");
  redirect(buildAdminNotificationsRedirect(rule.channel === "email" ? "email" : "send", "notice", rule.enabled ? "automation-disabled" : "automation-enabled", { mode: "automated" }));
}

export async function deleteNotificationAutomationRule(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  const rule = await prisma.notificationAutomationRule.findUniqueOrThrow({
    where: { id },
    select: { channel: true }
  });
  await prisma.notificationAutomationRule.delete({ where: { id } });
  revalidatePath("/admin/notifications");
  redirect(buildAdminNotificationsRedirect(rule.channel === "email" ? "email" : "send", "notice", "automation-deleted", { mode: "automated" }));
}

export async function archiveNotification(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") || "");

  await prisma.notification.update({
    where: { id },
    data: { status: "archived" }
  });

  revalidateNotificationPaths();
  redirect(buildAdminNotificationsRedirect("records", "notice", "withdrawn"));
}

export async function restoreNotification(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") || "");

  await prisma.notification.update({
    where: { id },
    data: { status: "sent" }
  });

  revalidateNotificationPaths();
  redirect(buildAdminNotificationsRedirect("records", "notice", "restored"));
}

function parseBeijingDateTime(value: string) {
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized)) {
    return null;
  }
  const parsed = new Date(`${normalized}:00+08:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function findDispatchRecipients(recipientIds: string[], requireEmail: boolean) {
  const recipients = await prisma.user.findMany({
    where: {
      id: { in: recipientIds },
      role: "student",
      status: "active"
    },
    select: {
      id: true,
      email: true,
      username: true,
      studentProfile: {
        select: {
          major: { select: { name: true } },
          region: { select: { province: true, studySystem: true } }
        }
      }
    }
  });

  return requireEmail
    ? recipients.filter((recipient) => isValidEmail(normalizeEmail(recipient.email || "")))
    : recipients;
}

function toDispatchRecipientSnapshot(recipient: Awaited<ReturnType<typeof findDispatchRecipients>>[number]) {
  return {
    userId: recipient.id,
    usernameSnapshot: recipient.username,
    emailSnapshot: recipient.email,
    provinceSnapshot: recipient.studentProfile?.region?.province || null,
    studySystemSnapshot: recipient.studentProfile?.region?.studySystem || null,
    majorNameSnapshot: recipient.studentProfile?.major?.name || null
  };
}

async function cancelDispatchJob(formData: FormData, channel: "email" | "in_app") {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  await prisma.notificationDispatchJob.updateMany({
    where: {
      id,
      channel,
      type: "scheduled",
      status: { in: ["pending", "failed"] }
    },
    data: {
      status: "cancelled",
      cancelledAt: new Date()
    }
  });
  revalidatePath("/admin/notifications");
  redirect(buildAdminNotificationsRedirect(channel === "email" ? "email" : "send", "notice", "schedule-cancelled", { mode: "scheduled" }));
}

async function rescheduleDispatchJob(formData: FormData, channel: "email" | "in_app") {
  await requireAdmin();
  const tab: NotificationTab = channel === "email" ? "email" : "send";
  const id = String(formData.get("id") || "");
  const scheduledAt = parseBeijingDateTime(String(formData.get("scheduledAt") || ""));
  if (!scheduledAt || scheduledAt.getTime() <= Date.now()) {
    redirect(buildAdminNotificationsRedirect(tab, "error", "scheduled-time-invalid", { mode: "scheduled" }));
  }
  await prisma.notificationDispatchJob.updateMany({
    where: {
      id,
      channel,
      type: "scheduled",
      status: { in: ["pending", "failed", "cancelled"] }
    },
    data: {
      status: "pending",
      scheduledAt,
      cancelledAt: null,
      failedAt: null,
      startedAt: null,
      attemptCount: 0,
      lastError: null
    }
  });
  revalidatePath("/admin/notifications");
  redirect(buildAdminNotificationsRedirect(tab, "notice", "schedule-updated", { mode: "scheduled" }));
}
