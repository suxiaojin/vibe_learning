import { Archive, Bell, RotateCcw, Send, UsersRound } from "lucide-react";
import { archiveNotification, restoreNotification, sendNotification } from "@/app/admin/notifications/actions";
import { RichTextEditor } from "@/components/rich-text-editor";
import { requireAdmin } from "@/lib/auth";
import { notificationRetentionDays, stripNotificationHtml } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const statusLabels: Record<string, string> = {
  archived: "已归档",
  draft: "草稿",
  sent: "已发送"
};

export default async function AdminNotificationsPage({
  searchParams
}: {
  searchParams?: Promise<{ error?: string; notice?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const [students, notifications, sentCount, unreadCount] = await Promise.all([
    prisma.user.findMany({
      where: { role: "student", status: "active" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        username: true,
        studentProfile: { select: { nickname: true } }
      }
    }),
    prisma.notification.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        author: { select: { username: true } },
        recipients: {
          orderBy: { deliveredAt: "desc" },
          select: {
            readAt: true,
            user: {
              select: {
                username: true,
                studentProfile: { select: { nickname: true } }
              }
            }
          }
        }
      }
    }),
    prisma.notification.count({ where: { status: "sent" } }),
    prisma.notificationRecipient.count({ where: { readAt: null, notification: { status: "sent" } } })
  ]);

  return (
    <main className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
      <section className="panel">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-black text-ink">通知管理</h1>
            <p className="mt-2 text-sm font-semibold text-slate-500">编写富文本通知，并发送给指定学生。</p>
          </div>
          <span className="grid size-11 place-items-center rounded-xl bg-teal/10 text-teal">
            <Bell size={22} />
          </span>
        </div>

        {params?.notice ? <div className="mt-4 rounded-xl bg-teal/10 p-3 text-sm font-semibold text-teal">{params.notice}</div> : null}
        {params?.error ? <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{params.error}</div> : null}

        <form action={sendNotification} className="mt-5 grid gap-4">
          <label>
            <span className="label">通知标题</span>
            <input className="input" maxLength={120} name="title" placeholder="例如：本周模拟测验提醒" required />
          </label>

          <div>
            <span className="label">通知内容</span>
            <RichTextEditor name="contentHtml" />
          </div>

          <fieldset>
            <legend className="label">接收学生</legend>
            <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-2">
              {students.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm font-semibold text-slate-500">暂无可发送的正常学生账号。</p>
              ) : (
                <div className="grid gap-2">
                  {students.map((student) => {
                    const displayName = student.studentProfile?.nickname || student.username;
                    return (
                      <label key={student.id} className="flex cursor-pointer items-center gap-3 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-sky-50">
                        <input className="size-4 accent-teal" name="recipientIds" type="checkbox" value={student.id} />
                        <span className="min-w-0 flex-1 truncate">{displayName}</span>
                        <span className="text-xs text-slate-400">{student.username}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </fieldset>

          <button className="primary-button" disabled={students.length === 0} type="submit">
            <Send size={18} />
            发送通知
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-ink">最近通知</h2>
            <p className="mt-2 text-sm font-semibold text-slate-500">通知有效期为 {notificationRetentionDays} 天，过期后学生端不再展示。</p>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="badge bg-slate-100 text-slate-600">已发送 {sentCount}</span>
            <span className="badge bg-coral/10 text-coral">未读 {unreadCount}</span>
          </div>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[860px] border-separate border-spacing-0 text-left text-sm">
            <thead>
              <tr className="text-slate-500">
                <th className="border-b border-slate-200 py-3 pr-4 font-semibold">通知</th>
                <th className="border-b border-slate-200 py-3 pr-4 font-semibold">收件人</th>
                <th className="border-b border-slate-200 py-3 pr-4 font-semibold">状态</th>
                <th className="border-b border-slate-200 py-3 pr-4 font-semibold">时间</th>
                <th className="border-b border-slate-200 py-3 font-semibold">操作</th>
              </tr>
            </thead>
            <tbody>
              {notifications.length === 0 ? (
                <tr>
                  <td className="py-12 text-center text-slate-500" colSpan={5}>暂无通知。</td>
                </tr>
              ) : notifications.map((notification) => {
                const readCount = notification.recipients.filter((recipient) => recipient.readAt).length;
                const recipientNames = notification.recipients.map((recipient) => recipient.user.studentProfile?.nickname || recipient.user.username);
                return (
                  <tr key={notification.id} className="align-top text-slate-700">
                    <td className="border-b border-slate-100 py-4 pr-4">
                      <p className="font-black text-ink">{notification.title}</p>
                      <p className="mt-1 max-h-10 max-w-md overflow-hidden text-xs font-semibold leading-5 text-slate-500">{stripNotificationHtml(notification.contentHtml)}</p>
                    </td>
                    <td className="border-b border-slate-100 py-4 pr-4">
                      <div className="flex items-center gap-2 font-semibold">
                        <UsersRound size={16} />
                        {notification.recipients.length} 人
                      </div>
                      <p className="mt-1 max-w-60 truncate text-xs text-slate-400">{recipientNames.join("、") || "暂无"}</p>
                      <p className="mt-1 text-xs text-slate-500">已读 {readCount}/{notification.recipients.length}</p>
                    </td>
                    <td className="border-b border-slate-100 py-4 pr-4">
                      <span className={cn("badge", notification.status === "archived" ? "bg-slate-100 text-slate-500" : "bg-teal/10 text-teal")}>
                        {statusLabels[notification.status]}
                      </span>
                    </td>
                    <td className="border-b border-slate-100 py-4 pr-4">
                      <p>{notification.sentAt ? formatDateTime(notification.sentAt) : formatDateTime(notification.createdAt)}</p>
                      <p className="mt-1 text-xs text-slate-400">到期 {notification.expiresAt ? formatDateTime(notification.expiresAt) : "未设置"}</p>
                      <p className="mt-1 text-xs text-slate-400">发送人 {notification.author?.username || "未知"}</p>
                    </td>
                    <td className="border-b border-slate-100 py-4">
                      {notification.status === "archived" ? (
                        <form action={restoreNotification}>
                          <input name="id" type="hidden" value={notification.id} />
                          <button className="secondary-button px-3 py-2 text-xs" type="submit">
                            <RotateCcw size={15} />
                            恢复
                          </button>
                        </form>
                      ) : (
                        <form action={archiveNotification}>
                          <input name="id" type="hidden" value={notification.id} />
                          <button className="secondary-button px-3 py-2 text-xs" type="submit">
                            <Archive size={15} />
                            归档
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
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
