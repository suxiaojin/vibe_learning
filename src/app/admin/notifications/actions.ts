"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getNotificationExpiresAt, sanitizeNotificationHtml, stripNotificationHtml } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

function buildAdminNotificationsRedirect(key: "notice" | "error", message: string) {
  const params = new URLSearchParams({ [key]: message });
  return `/admin/notifications?${params.toString()}`;
}

function getRecipientIds(formData: FormData) {
  return Array.from(new Set(formData.getAll("recipientIds").map((item) => String(item).trim()).filter(Boolean)));
}

export async function sendNotification(formData: FormData) {
  const admin = await requireAdmin();
  const title = String(formData.get("title") || "").trim().slice(0, 120);
  const contentHtml = sanitizeNotificationHtml(String(formData.get("contentHtml") || ""));
  const contentText = stripNotificationHtml(contentHtml);
  const recipientIds = getRecipientIds(formData);

  if (!title) {
    redirect(buildAdminNotificationsRedirect("error", "请输入通知标题"));
  }
  if (!contentText) {
    redirect(buildAdminNotificationsRedirect("error", "请输入通知内容"));
  }
  if (recipientIds.length === 0) {
    redirect(buildAdminNotificationsRedirect("error", "请选择接收学生"));
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
    redirect(buildAdminNotificationsRedirect("error", "没有找到可接收通知的学生"));
  }

  const now = new Date();
  await prisma.notification.create({
    data: {
      title,
      contentHtml,
      status: "sent",
      authorId: admin.id,
      sentAt: now,
      expiresAt: getNotificationExpiresAt(now),
      recipients: {
        create: recipients.map((recipient) => ({
          userId: recipient.id,
          deliveredAt: now
        }))
      }
    }
  });

  revalidatePath("/admin/notifications");
  revalidatePath("/learn");
  revalidatePath("/notifications");
  redirect(buildAdminNotificationsRedirect("notice", `通知已发送给 ${recipients.length} 名学生`));
}

export async function archiveNotification(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") || "");

  await prisma.notification.update({
    where: { id },
    data: { status: "archived" }
  });

  revalidatePath("/admin/notifications");
  revalidatePath("/learn");
  revalidatePath("/notifications");
  redirect(buildAdminNotificationsRedirect("notice", "通知已归档"));
}

export async function restoreNotification(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") || "");

  await prisma.notification.update({
    where: { id },
    data: { status: "sent" }
  });

  revalidatePath("/admin/notifications");
  revalidatePath("/learn");
  revalidatePath("/notifications");
  redirect(buildAdminNotificationsRedirect("notice", "通知已恢复"));
}
