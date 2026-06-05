import Link from "next/link";
import type { ReactNode } from "react";
import { Bell, FileText } from "lucide-react";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { StudentSidebar } from "@/components/student-sidebar";
import { requireUser } from "@/lib/auth";
import { acceptBuddyRequest, formatBuddyError, rejectBuddyRequest } from "@/lib/buddies";
import { prisma } from "@/lib/prisma";
import {
  getUserEventNotificationText,
  getUserEventNotificationTitle,
  markBuddyNotificationsRead
} from "@/lib/user-event-notifications";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type NotificationTab = "system" | "buddies";

const tabs: Array<{ key: NotificationTab; label: string }> = [
  { key: "system", label: "系统消息" },
  { key: "buddies", label: "搭子消息" }
];

export default async function NotificationsPage({
  searchParams
}: {
  searchParams?: Promise<{ tab?: string; error?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const activeTab = getActiveTab(params?.tab);
  const now = new Date();

  const visibleNotificationWhere = {
    userId: user.id,
    notification: {
      status: "sent" as const
    }
  };

  const [systemUnreadCount, buddyUnreadCount] = await Promise.all([
    prisma.notificationRecipient.count({ where: { ...visibleNotificationWhere, readAt: null } }),
    prisma.userEventNotification.count({ where: { recipientId: user.id, readAt: null } })
  ]);

  if (activeTab === "system") {
    const unreadReceipts = await prisma.notificationRecipient.findMany({
      where: {
        ...visibleNotificationWhere,
        readAt: null
      },
      select: { id: true }
    });
    const unreadReceiptIds = unreadReceipts.map((receipt) => receipt.id);

    if (unreadReceiptIds.length > 0) {
      await prisma.notificationRecipient.updateMany({
        where: { id: { in: unreadReceiptIds } },
        data: { readAt: now }
      });
    }

    const receipts = await prisma.notificationRecipient.findMany({
      where: visibleNotificationWhere,
      orderBy: { deliveredAt: "desc" },
      include: {
        notification: {
          select: {
            title: true,
            contentHtml: true,
            sentAt: true
          }
        }
      }
    });
    const unreadSet = new Set(unreadReceiptIds);

    return (
      <NotificationShell activeTab={activeTab} buddyUnreadCount={buddyUnreadCount} systemUnreadCount={systemUnreadCount}>
        <p className="text-base font-semibold text-red-600">
          说明：系统通知会长期保留；管理员撤回后将不再显示。
        </p>
        <SystemNotificationsTable receipts={receipts} unreadSet={unreadSet} />
      </NotificationShell>
    );
  }

  await markBuddyNotificationsRead(user.id);
  const buddyNotifications = await prisma.userEventNotification.findMany({
    where: { recipientId: user.id },
    orderBy: { createdAt: "desc" },
    include: {
      request: true
    },
    take: 200
  });

  return (
    <NotificationShell activeTab={activeTab} buddyUnreadCount={buddyUnreadCount} errorCode={params?.error} systemUnreadCount={systemUnreadCount}>
      <p className="text-base font-semibold text-red-600">
        说明：搭子申请、申请结果、点赞和转帖消息会在这里展示。
      </p>
      <BuddyNotificationsTable notifications={buddyNotifications} userId={user.id} />
    </NotificationShell>
  );
}

function NotificationShell({
  activeTab,
  buddyUnreadCount,
  children,
  errorCode,
  systemUnreadCount
}: {
  activeTab: NotificationTab;
  buddyUnreadCount: number;
  children: ReactNode;
  errorCode?: string;
  systemUnreadCount: number;
}) {
  const errorText: Record<string, string> = {
    BUDDY_REQUEST_NOT_ACTIONABLE: "该申请当前不能处理。",
    BUDDY_REQUEST_FORBIDDEN: "不能处理不属于你的申请。",
    UNKNOWN: "操作失败，请稍后再试。"
  };

  return (
    <main className="min-h-dvh bg-[#f2f2f2] lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      <StudentSidebar active="notifications" />

      <section className="min-w-0 px-5 py-7 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <nav className="mb-8 text-sm font-semibold text-slate-600" aria-label="面包屑">
            <Link className="hover:text-teal" href="/learn">首页</Link>
            <span className="mx-2 text-slate-400">&gt;</span>
            <span>消息中心</span>
          </nav>

          <div className="bg-white">
            <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-6 py-6">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-xl bg-sky-50 text-sky-600">
                  <Bell size={22} />
                </span>
                <h1 className="text-2xl font-medium text-slate-900">消息中心</h1>
              </div>
              <div className="flex min-h-11 flex-wrap items-center gap-8 text-base text-slate-700">
                {tabs.map((tab) => {
                  const unread = tab.key === "system" ? systemUnreadCount : buddyUnreadCount;
                  return (
                    <Link
                      key={tab.key}
                      className={activeTab === tab.key ? "border-b-4 border-[#0872b9] px-1 pb-4 font-semibold text-[#0872b9]" : "px-1 pb-4 text-slate-700"}
                      href={`/notifications?tab=${tab.key}`}
                    >
                      {tab.label}
                      {unread > 0 ? <span className="ml-2 rounded-full bg-coral px-2 py-0.5 text-xs font-black text-white">{unread > 99 ? "99+" : unread}</span> : null}
                    </Link>
                  );
                })}
              </div>
            </header>

            <div className="px-6 py-5">
              {errorCode ? (
                <p className="mb-4 rounded-xl bg-coral/10 px-4 py-3 text-sm font-bold text-coral">
                  {errorText[errorCode] || errorText.UNKNOWN}
                </p>
              ) : null}
              {children}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function SystemNotificationsTable({
  receipts,
  unreadSet
}: {
  receipts: Array<{
    id: string;
    deliveredAt: Date;
    notification: { title: string; contentHtml: string; sentAt: Date | null };
  }>;
  unreadSet: Set<string>;
}) {
  return (
    <div className="mt-6 overflow-x-auto border border-slate-200">
      <table className="w-full min-w-[760px] table-fixed border-collapse text-center text-sm">
        <thead>
          <tr className="bg-[#f5fafc] text-slate-800">
            <th className="border-b border-slate-200 px-4 py-4 font-medium">消息名称</th>
            <th className="border-b border-slate-200 px-4 py-4 font-medium">消息内容</th>
            <th className="border-b border-slate-200 px-4 py-4 font-medium">消息时间</th>
          </tr>
        </thead>
        <tbody>
          {receipts.length === 0 ? (
            <EmptyTable colSpan={3} />
          ) : (
            receipts.map((receipt) => (
              <tr key={receipt.id} className="align-top text-slate-700">
                <td className="border-b border-slate-100 px-4 py-5 text-left">
                  <div className="flex items-center gap-2">
                    {unreadSet.has(receipt.id) ? <span className="badge bg-coral/10 text-coral">未读</span> : null}
                    <span className="font-semibold text-slate-900">{receipt.notification.title}</span>
                  </div>
                </td>
                <td className="border-b border-slate-100 px-4 py-5 text-left">
                  <div
                    className="notification-rich-text max-w-none text-sm leading-7 text-slate-700 [&_a]:font-semibold [&_a]:text-teal [&_blockquote]:border-l-4 [&_blockquote]:border-slate-300 [&_blockquote]:pl-3 [&_h2]:text-lg [&_h2]:font-black [&_h3]:font-bold [&_img]:my-3 [&_img]:h-auto [&_img]:max-w-full [&_li]:ml-5 [&_ol]:list-decimal [&_p]:my-1 [&_ul]:list-disc"
                    dangerouslySetInnerHTML={{ __html: receipt.notification.contentHtml }}
                  />
                </td>
                <td className="border-b border-slate-100 px-4 py-5 text-slate-600">
                  {receipt.notification.sentAt ? formatDateTime(receipt.notification.sentAt) : formatDateTime(receipt.deliveredAt)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function BuddyNotificationsTable({
  notifications,
  userId
}: {
  notifications: Array<{
    id: string;
    type: Parameters<typeof getUserEventNotificationTitle>[0];
    actorNicknameSnapshot: string;
    createdAt: Date;
    request: {
      id: string;
      requesterId: string;
      recipientId: string;
      status: string;
      expiresAt: Date;
    } | null;
  }>;
  userId: string;
}) {
  const now = new Date();

  return (
    <div className="mt-6 overflow-x-auto border border-slate-200">
      <table className="w-full min-w-[760px] table-fixed border-collapse text-center text-sm">
        <thead>
          <tr className="bg-[#f5fafc] text-slate-800">
            <th className="border-b border-slate-200 px-4 py-4 font-medium">消息名称</th>
            <th className="border-b border-slate-200 px-4 py-4 font-medium">消息内容</th>
            <th className="border-b border-slate-200 px-4 py-4 font-medium">操作</th>
            <th className="border-b border-slate-200 px-4 py-4 font-medium">消息时间</th>
          </tr>
        </thead>
        <tbody>
          {notifications.length === 0 ? (
            <EmptyTable colSpan={4} />
          ) : (
            notifications.map((notification) => {
              const request = notification.request;
              const actionable = request?.status === "pending" && request.recipientId === userId && request.expiresAt > now;
              return (
                <tr key={notification.id} className="align-top text-slate-700">
                  <td className="border-b border-slate-100 px-4 py-5 text-left font-semibold text-slate-900">
                    {getUserEventNotificationTitle(notification.type)}
                  </td>
                  <td className="border-b border-slate-100 px-4 py-5 text-left">
                    {getUserEventNotificationText(notification)}
                  </td>
                  <td className="border-b border-slate-100 px-4 py-5">
                    {actionable && request ? (
                      <div className="flex justify-center gap-2">
                        <form action={acceptRequestFromNotification}>
                          <input name="requestId" type="hidden" value={request.id} />
                          <button className="rounded-xl bg-teal px-3 py-2 text-xs font-black text-white" type="submit">接受</button>
                        </form>
                        <form action={rejectRequestFromNotification}>
                          <input name="requestId" type="hidden" value={request.id} />
                          <button className="rounded-xl bg-coral px-3 py-2 text-xs font-black text-white" type="submit">拒绝</button>
                        </form>
                      </div>
                    ) : request ? (
                      <span className="text-xs font-bold text-slate-400">{requestStatusText(request.status, request.expiresAt)}</span>
                    ) : (
                      <span className="text-xs font-bold text-slate-400">-</span>
                    )}
                  </td>
                  <td className="border-b border-slate-100 px-4 py-5 text-slate-600">{formatDateTime(notification.createdAt)}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

function EmptyTable({ colSpan }: { colSpan: number }) {
  return (
    <tr>
      <td className="h-[450px] border-b border-slate-100 px-4 py-12" colSpan={colSpan}>
        <div className="grid place-items-center text-slate-400">
          <div className="grid size-28 place-items-center rounded-full bg-slate-100 text-slate-300">
            <FileText size={56} strokeWidth={1.5} />
          </div>
          <p className="mt-4 text-lg font-medium">暂无数据</p>
        </div>
      </td>
    </tr>
  );
}

function getActiveTab(tab?: string): NotificationTab {
  return tab === "buddies" ? "buddies" : "system";
}

function requestStatusText(status: string, expiresAt: Date) {
  if (status === "pending" && expiresAt <= new Date()) {
    return "已过期";
  }
  const labels: Record<string, string> = {
    pending: "待处理",
    accepted: "已接受",
    rejected: "已拒绝",
    withdrawn: "已撤回",
    expired: "已过期"
  };
  return labels[status] || status;
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

async function acceptRequestFromNotification(formData: FormData) {
  "use server";
  const user = await requireUser();
  try {
    await acceptBuddyRequest(user.id, String(formData.get("requestId") || ""));
  } catch (error) {
    redirectWithNotificationError(error);
  }
  revalidatePath("/notifications");
  revalidatePath("/me");
  revalidatePath("/buddy-circle");
  redirect("/notifications?tab=buddies");
}

async function rejectRequestFromNotification(formData: FormData) {
  "use server";
  const user = await requireUser();
  try {
    await rejectBuddyRequest(user.id, String(formData.get("requestId") || ""));
  } catch (error) {
    redirectWithNotificationError(error);
  }
  revalidatePath("/notifications");
  revalidatePath("/me");
  redirect("/notifications?tab=buddies");
}

function redirectWithNotificationError(error: unknown): never {
  const buddyError = formatBuddyError(error);
  redirect(`/notifications?tab=buddies&error=${buddyError?.code || "UNKNOWN"}`);
}
