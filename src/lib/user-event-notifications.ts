import type { Prisma, UserEventNotificationType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type NotificationClient = Prisma.TransactionClient;

type CreateUserEventNotificationInput = {
  recipientId: string;
  actorId?: string | null;
  type: UserEventNotificationType;
  requestId?: string | null;
  postId?: string | null;
  dedupeKey: string;
};

export type BellNotificationItem = {
  id: string;
  title: string;
  contentHtml: string;
  sentAt: Date | null;
};

export async function createUserEventNotification(
  tx: NotificationClient,
  input: CreateUserEventNotificationInput
) {
  const actorNicknameSnapshot = input.actorId ? await getActorDisplayName(tx, input.actorId) : "系统";

  return tx.userEventNotification.upsert({
    where: { dedupeKey: input.dedupeKey },
    update: {},
    create: {
      recipientId: input.recipientId,
      actorId: input.actorId || null,
      actorNicknameSnapshot,
      type: input.type,
      requestId: input.requestId || null,
      postId: input.postId || null,
      dedupeKey: input.dedupeKey
    }
  });
}

export async function getNotificationBellData(userId: string, take = 5) {
  const systemWhere = {
    userId,
    readAt: null,
    notification: {
      status: "sent" as const
    }
  };
  const [systemReceipts, systemUnreadCount, buddyNotifications, buddyUnreadCount] = await Promise.all([
    prisma.notificationRecipient.findMany({
      where: systemWhere,
      orderBy: { deliveredAt: "desc" },
      take,
      select: {
        deliveredAt: true,
        notification: {
          select: {
            id: true,
            title: true,
            contentHtml: true,
            sentAt: true
          }
        }
      }
    }),
    prisma.notificationRecipient.count({ where: systemWhere }),
    prisma.userEventNotification.findMany({
      where: { recipientId: userId, readAt: null },
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        type: true,
        actorNicknameSnapshot: true,
        createdAt: true
      }
    }),
    prisma.userEventNotification.count({ where: { recipientId: userId, readAt: null } })
  ]);

  const systemItems: BellNotificationItem[] = systemReceipts.map((receipt) => ({
    id: `system:${receipt.notification.id}`,
    title: receipt.notification.title,
    contentHtml: receipt.notification.contentHtml,
    sentAt: receipt.notification.sentAt || receipt.deliveredAt
  }));
  const buddyItems: BellNotificationItem[] = buddyNotifications.map((notification) => {
    const text = getUserEventNotificationText(notification);
    return {
      id: `buddy:${notification.id}`,
      title: getUserEventNotificationTitle(notification.type),
      contentHtml: escapeHtml(text),
      sentAt: notification.createdAt
    };
  });

  return {
    unreadCount: systemUnreadCount + buddyUnreadCount,
    notifications: [...systemItems, ...buddyItems]
      .sort((left, right) => (right.sentAt?.getTime() || 0) - (left.sentAt?.getTime() || 0))
      .slice(0, take)
  };
}

export async function markBuddyNotificationsRead(userId: string) {
  await prisma.userEventNotification.updateMany({
    where: {
      recipientId: userId,
      readAt: null
    },
    data: { readAt: new Date() }
  });
}

export function getUserEventNotificationTitle(type: UserEventNotificationType) {
  const titleByType: Record<UserEventNotificationType, string> = {
    buddy_request_received: "搭子申请",
    buddy_request_accepted: "搭子申请已接受",
    buddy_request_rejected: "搭子申请被拒绝",
    buddy_post_liked: "动态被点赞",
    buddy_post_reposted: "动态被转帖"
  };
  return titleByType[type];
}

export function getUserEventNotificationText(input: {
  type: UserEventNotificationType;
  actorNicknameSnapshot: string;
}) {
  const actor = input.actorNicknameSnapshot || "对方";
  const textByType: Record<UserEventNotificationType, string> = {
    buddy_request_received: `${actor} 正在添加您为他的搭子`,
    buddy_request_accepted: `${actor} 已接受你的搭子申请`,
    buddy_request_rejected: `${actor} 拒绝成为你的搭子`,
    buddy_post_liked: `${actor} 点赞了你的动态`,
    buddy_post_reposted: `${actor} 转帖了你的动态`
  };
  return textByType[input.type];
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function getActorDisplayName(tx: NotificationClient, actorId: string) {
  const actor = await tx.user.findUnique({
    where: { id: actorId },
    select: {
      username: true,
      studentProfile: { select: { nickname: true } }
    }
  });

  return actor?.studentProfile?.nickname || actor?.username || "对方";
}
