"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { notificationHtmlMaxChars, sanitizeNotificationHtml, stripNotificationHtml } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

type NotificationTab = "records" | "send" | "templates";
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
    select: { id: true }
  });

  if (recipients.length === 0) {
    redirect(buildAdminNotificationsRedirect("send", "error", "recipients-unavailable"));
  }

  const now = new Date();
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

  revalidateNotificationPaths();
  redirect(buildAdminNotificationsRedirect("send", "notice", "sent", { count: String(recipients.length) }));
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

export async function cancelScheduledNotification(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  await prisma.notificationDispatchJob.updateMany({
    where: {
      id,
      type: "scheduled",
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
  const admin = await requireAdmin();
  const name = String(formData.get("name") || "").trim().slice(0, 100);
  const eventType = String(formData.get("eventType") || "");
  const templateId = String(formData.get("templateId") || "");
  const delayMinutes = Number(formData.get("delayMinutes") || 0);

  if (!name) {
    redirect(buildAdminNotificationsRedirect("send", "error", "automation-name-required", { mode: "automated" }));
  }
  if (!automationEventTypes.has(eventType)) {
    redirect(buildAdminNotificationsRedirect("send", "error", "automation-event-required", { mode: "automated" }));
  }
  if (!templateId) {
    redirect(buildAdminNotificationsRedirect("send", "error", "template-required", { mode: "automated" }));
  }
  if (!Number.isInteger(delayMinutes) || delayMinutes < 0 || delayMinutes > 10080) {
    redirect(buildAdminNotificationsRedirect("send", "error", "automation-delay-invalid", { mode: "automated" }));
  }

  await prisma.notificationTemplate.findUniqueOrThrow({ where: { id: templateId }, select: { id: true } });
  await prisma.notificationAutomationRule.create({
    data: {
      name,
      eventType: eventType as "user_registered" | "admin_diamond_added" | "diamond_purchase_succeeded",
      templateId,
      delayMinutes,
      enabled: formData.get("enabled") === "on",
      createdById: admin.id
    }
  });
  revalidatePath("/admin/notifications");
  redirect(buildAdminNotificationsRedirect("send", "notice", "automation-created", { mode: "automated" }));
}

export async function toggleNotificationAutomationRule(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  const rule = await prisma.notificationAutomationRule.findUniqueOrThrow({
    where: { id },
    select: { enabled: true }
  });
  await prisma.notificationAutomationRule.update({
    where: { id },
    data: { enabled: !rule.enabled }
  });
  revalidatePath("/admin/notifications");
  redirect(buildAdminNotificationsRedirect("send", "notice", rule.enabled ? "automation-disabled" : "automation-enabled", { mode: "automated" }));
}

export async function deleteNotificationAutomationRule(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  await prisma.notificationAutomationRule.delete({ where: { id } });
  revalidatePath("/admin/notifications");
  redirect(buildAdminNotificationsRedirect("send", "notice", "automation-deleted", { mode: "automated" }));
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
