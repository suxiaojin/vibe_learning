import Link from "next/link";
import { Bell } from "lucide-react";
import { stripNotificationHtml } from "@/lib/notifications";

type BellNotification = {
  id: string;
  title: string;
  contentHtml: string;
  sentAt: Date | null;
};

export function NotificationBell({
  notifications,
  unreadCount
}: {
  notifications: BellNotification[];
  unreadCount: number;
}) {
  const badgeText = unreadCount > 99 ? "99+" : String(unreadCount);

  return (
    <div className="group relative">
      <Link
        aria-label={`通知，${unreadCount} 条未读`}
        className="relative grid size-11 place-items-center rounded-xl text-slate-700 transition hover:bg-white hover:text-teal focus:outline-none focus:ring-2 focus:ring-teal/20"
        href="/notifications"
        title="通知"
      >
        <Bell size={24} />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-coral px-1.5 py-0.5 text-center text-[11px] font-black leading-none text-white shadow-sm">
            {badgeText}
          </span>
        ) : null}
      </Link>

      <div className="pointer-events-none invisible absolute right-0 top-full z-50 w-80 translate-y-2 opacity-0 transition duration-150 group-hover:visible group-hover:translate-y-1 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-1 group-focus-within:opacity-100">
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-left shadow-[0_12px_32px_rgba(15,23,42,0.18)]">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <p className="text-sm font-black text-ink">未读通知</p>
            <span className="text-xs font-bold text-coral">{unreadCount}</span>
          </div>
          {notifications.length === 0 ? (
            <p className="py-5 text-center text-sm font-semibold text-slate-500">暂无未读通知。</p>
          ) : (
            <div className="mt-2 grid gap-2">
              {notifications.map((notification) => (
                <div key={notification.id} className="rounded-lg bg-slate-50 p-3">
                  <p className="truncate text-sm font-black text-ink">{notification.title}</p>
                  <p className="mt-1 max-h-10 overflow-hidden text-xs font-semibold leading-5 text-slate-500">
                    {stripNotificationHtml(notification.contentHtml)}
                  </p>
                  <p className="mt-2 text-[11px] font-semibold text-slate-400">
                    {notification.sentAt ? formatDateTime(notification.sentAt) : "刚刚"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
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
