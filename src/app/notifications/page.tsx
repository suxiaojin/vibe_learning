import Link from "next/link";
import type { ReactNode } from "react";
import {
  Bell,
  BellRing,
  CheckCheck,
  Heart,
  Inbox,
  ListChecks,
  Repeat2,
  UserCheck,
  UserPlus,
  UserX
} from "lucide-react";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { NotificationBulkToolbar } from "@/components/notification-bulk-toolbar";
import { StudentSidebar } from "@/components/student-sidebar";
import { requireUser } from "@/lib/auth";
import { acceptBuddyRequest, formatBuddyError, rejectBuddyRequest } from "@/lib/buddies";
import { prisma } from "@/lib/prisma";
import {
  escapeHtml,
  getUserEventNotificationText,
  getUserEventNotificationTitle
} from "@/lib/user-event-notifications";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type NotificationTab = "system" | "buddies";
type SystemReceipt = {
  id: string;
  deliveredAt: Date;
  readAt: Date | null;
  notification: { id: string; title: string; contentHtml: string; sentAt: Date | null };
};
type BuddyNotification = {
  id: string;
  type: Parameters<typeof getUserEventNotificationTitle>[0];
  actorNicknameSnapshot: string;
  createdAt: Date;
  readAt: Date | null;
  request: {
    id: string;
    requesterId: string;
    recipientId: string;
    status: string;
    expiresAt: Date;
  } | null;
};

const tabs: Array<{ key: NotificationTab; label: string }> = [
  { key: "system", label: "系统消息" },
  { key: "buddies", label: "互动消息" }
];
const pageSize = 10;

export default async function NotificationsPage({
  searchParams
}: {
  searchParams?: Promise<{ tab?: string; error?: string; manage?: string; notificationId?: string; page?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const activeTab = getActiveTab(params?.tab);
  const manageMode = params?.manage === "1";
  const requestedPage = parsePage(params?.page);

  const visibleNotificationWhere = {
    userId: user.id,
    notification: { status: "sent" as const }
  };

  if (params?.notificationId) {
    if (activeTab === "system") {
      await prisma.notificationRecipient.updateMany({
        where: {
          userId: user.id,
          readAt: null,
          OR: [{ id: params.notificationId }, { notificationId: params.notificationId }]
        },
        data: { readAt: new Date() }
      });
    } else {
      await prisma.userEventNotification.updateMany({
        where: { id: params.notificationId, recipientId: user.id, readAt: null },
        data: { readAt: new Date() }
      });
    }
  }

  const [systemUnreadCount, buddyUnreadCount] = await Promise.all([
    prisma.notificationRecipient.count({ where: { ...visibleNotificationWhere, readAt: null } }),
    prisma.userEventNotification.count({ where: { recipientId: user.id, readAt: null } })
  ]);

  if (activeTab === "system") {
    const totalCount = await prisma.notificationRecipient.count({ where: visibleNotificationWhere });
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const currentPage = Math.min(requestedPage, totalPages);
    const receipts = await prisma.notificationRecipient.findMany({
      where: visibleNotificationWhere,
      orderBy: { deliveredAt: "desc" },
      skip: (currentPage - 1) * pageSize,
      take: pageSize,
      include: {
        notification: {
          select: { id: true, title: true, contentHtml: true, sentAt: true }
        }
      }
    });
    const selectedReceipt = receipts.find((receipt) => (
      receipt.id === params?.notificationId || receipt.notification.id === params?.notificationId
    )) || null;

    return (
      <NotificationShell
        activeTab={activeTab}
        buddyUnreadCount={buddyUnreadCount}
        currentPage={currentPage}
        detail={selectedReceipt ? (
          <NotificationDetailPanel
            contentHtml={selectedReceipt.notification.contentHtml}
            icon={<BellRing size={22} />}
            sentAt={selectedReceipt.notification.sentAt || selectedReceipt.deliveredAt}
            title={selectedReceipt.notification.title}
          />
        ) : <NotificationDetailPanel />}
        errorCode={params?.error}
        list={(
          <SystemNotificationsList
            currentPage={currentPage}
            manageMode={manageMode}
            receipts={receipts}
            selectedId={selectedReceipt?.id}
            totalPages={totalPages}
          />
        )}
        manageMode={manageMode}
        systemUnreadCount={systemUnreadCount}
      />
    );
  }

  const totalCount = await prisma.userEventNotification.count({ where: { recipientId: user.id } });
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(requestedPage, totalPages);
  const notifications = await prisma.userEventNotification.findMany({
    where: { recipientId: user.id },
    orderBy: { createdAt: "desc" },
    include: { request: true },
    skip: (currentPage - 1) * pageSize,
    take: pageSize
  });
  const selectedNotification = notifications.find((notification) => notification.id === params?.notificationId) || null;

  return (
    <NotificationShell
      activeTab={activeTab}
      buddyUnreadCount={buddyUnreadCount}
      currentPage={currentPage}
      detail={selectedNotification ? (
        <NotificationDetailPanel
          actions={<BuddyNotificationActions notification={selectedNotification} userId={user.id} />}
          contentHtml={escapeHtml(getUserEventNotificationText(selectedNotification))}
          icon={buddyNotificationIcon(selectedNotification.type, 22)}
          sentAt={selectedNotification.createdAt}
          title={getUserEventNotificationTitle(selectedNotification.type)}
        />
      ) : <NotificationDetailPanel />}
      errorCode={params?.error}
      list={(
        <BuddyNotificationsList
          currentPage={currentPage}
          manageMode={manageMode}
          notifications={notifications}
          selectedId={selectedNotification?.id}
          totalPages={totalPages}
        />
      )}
      manageMode={manageMode}
      systemUnreadCount={systemUnreadCount}
    />
  );
}

function NotificationShell({
  activeTab,
  buddyUnreadCount,
  currentPage,
  detail,
  errorCode,
  list,
  manageMode,
  systemUnreadCount
}: {
  activeTab: NotificationTab;
  buddyUnreadCount: number;
  currentPage: number;
  detail: ReactNode;
  errorCode?: string;
  list: ReactNode;
  manageMode: boolean;
  systemUnreadCount: number;
}) {
  const errorText: Record<string, string> = {
    BUDDY_REQUEST_NOT_ACTIONABLE: "该申请当前不能处理。",
    BUDDY_REQUEST_FORBIDDEN: "不能处理不属于你的申请。",
    UNKNOWN: "操作失败，请稍后再试。"
  };
  const unreadTotal = systemUnreadCount + buddyUnreadCount;
  const baseHref = `/notifications?tab=${activeTab}&page=${currentPage}`;

  return (
    <main className="min-h-dvh bg-mist/70 lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      <StudentSidebar active="notifications" />

      <section className="min-w-0 px-5 py-7 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <nav className="mb-5 text-sm font-semibold text-slate-500" aria-label="面包屑">
            <Link className="hover:text-teal" href="/learn">首页</Link>
            <span className="mx-2 text-slate-300">/</span>
            <span className="text-slate-700">消息中心</span>
          </nav>

          <section className="overflow-hidden border border-slate-200 bg-white shadow-sm">
            <header className="border-b border-slate-200 px-6 pt-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="grid size-11 place-items-center rounded-lg bg-sky-50 text-sky-600">
                      <Bell size={22} />
                    </span>
                    <div>
                      <h1 className="text-2xl font-black text-ink">消息中心</h1>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <form action={markAllNotificationsRead}>
                    <input name="tab" type="hidden" value={activeTab} />
                    <input name="page" type="hidden" value={currentPage} />
                    <button
                      className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-600 transition hover:border-teal/40 hover:text-teal disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={unreadTotal === 0}
                      type="submit"
                    >
                      <CheckCheck size={17} />
                      全部已读
                    </button>
                  </form>
                  <Link
                    className={cn(
                      "inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm font-bold transition",
                      manageMode
                        ? "border-sky-300 bg-sky-50 text-sky-600"
                        : "border-slate-200 bg-white text-slate-600 hover:border-sky-300 hover:text-sky-600"
                    )}
                    href={manageMode ? baseHref : `${baseHref}&manage=1`}
                  >
                    <ListChecks size={17} />
                    {manageMode ? "完成" : "批量管理"}
                  </Link>
                </div>
              </div>

              <nav className="mt-6 flex items-center gap-7" aria-label="消息分类">
                {tabs.map((tab) => {
                  const unread = tab.key === "system" ? systemUnreadCount : buddyUnreadCount;
                  return (
                    <Link
                      key={tab.key}
                      className={cn(
                        "relative inline-flex min-h-12 items-center gap-2 border-b-2 px-1 text-sm font-black transition",
                        activeTab === tab.key
                          ? "border-sky-500 text-sky-600"
                          : "border-transparent text-slate-500 hover:text-ink"
                      )}
                      href={`/notifications?tab=${tab.key}`}
                    >
                      {tab.label}
                      {unread > 0 ? (
                        <span className="min-w-5 rounded-full bg-coral px-1.5 py-0.5 text-center text-[11px] font-black leading-none text-white">
                          {unread > 99 ? "99+" : unread}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </nav>
            </header>

            {errorCode ? (
              <p className="mx-6 mt-5 rounded-lg bg-coral/10 px-4 py-3 text-sm font-bold text-coral">
                {errorText[errorCode] || errorText.UNKNOWN}
              </p>
            ) : null}

            <div className="grid min-h-[620px] lg:grid-cols-[390px_minmax(0,1fr)]">
              <section className="min-w-0 border-r border-slate-200" aria-label="消息列表">
                {list}
              </section>
              <section className="min-w-0 bg-white" aria-label="消息详情">
                {detail}
              </section>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function SystemNotificationsList({
  currentPage,
  manageMode,
  receipts,
  selectedId,
  totalPages
}: {
  currentPage: number;
  manageMode: boolean;
  receipts: SystemReceipt[];
  selectedId?: string;
  totalPages: number;
}) {
  const deleteFormId = "delete-system-notifications";
  return (
    <div className="flex h-full flex-col">
      <form action={deleteSelectedNotifications} id={deleteFormId}>
        <input name="manage" type="hidden" value={manageMode ? "1" : "0"} />
        <input name="page" type="hidden" value={currentPage} />
        <input name="tab" type="hidden" value="system" />
      </form>
      {manageMode ? <NotificationBulkToolbar formId={deleteFormId} itemCount={receipts.length} /> : null}
      <div className="min-h-0 flex-1">
        {receipts.length === 0 ? (
          <EmptyList label="暂无系统消息" />
        ) : receipts.map((receipt) => (
          <NotificationListItem
            key={receipt.id}
            checkboxLabel={`选择消息：${receipt.notification.title}`}
            checkboxValue={receipt.id}
            formId={deleteFormId}
            href={`/notifications?tab=system&page=${currentPage}&notificationId=${receipt.id}`}
            icon={<BellRing size={19} />}
            iconClassName="bg-sky-50 text-sky-600"
            manageMode={manageMode}
            selected={selectedId === receipt.id}
            time={formatCompactDate(receipt.notification.sentAt || receipt.deliveredAt)}
            title={receipt.notification.title}
            unread={!receipt.readAt}
          />
        ))}
      </div>
      <NotificationPagination currentPage={currentPage} manageMode={manageMode} tab="system" totalPages={totalPages} />
    </div>
  );
}

function BuddyNotificationsList({
  currentPage,
  manageMode,
  notifications,
  selectedId,
  totalPages
}: {
  currentPage: number;
  manageMode: boolean;
  notifications: BuddyNotification[];
  selectedId?: string;
  totalPages: number;
}) {
  const deleteFormId = "delete-buddy-notifications";
  return (
    <div className="flex h-full flex-col">
      <form action={deleteSelectedNotifications} id={deleteFormId}>
        <input name="manage" type="hidden" value={manageMode ? "1" : "0"} />
        <input name="page" type="hidden" value={currentPage} />
        <input name="tab" type="hidden" value="buddies" />
      </form>
      {manageMode ? <NotificationBulkToolbar formId={deleteFormId} itemCount={notifications.length} /> : null}
      <div className="min-h-0 flex-1">
        {notifications.length === 0 ? (
          <EmptyList label="暂无互动消息" />
        ) : notifications.map((notification) => (
          <NotificationListItem
            key={notification.id}
            checkboxLabel={`选择消息：${getUserEventNotificationTitle(notification.type)}`}
            checkboxValue={notification.id}
            formId={deleteFormId}
            href={`/notifications?tab=buddies&page=${currentPage}&notificationId=${notification.id}`}
            icon={buddyNotificationIcon(notification.type, 19)}
            iconClassName={buddyNotificationIconClass(notification.type)}
            manageMode={manageMode}
            meta={notification.request ? requestStatusText(notification.request.status, notification.request.expiresAt) : undefined}
            selected={selectedId === notification.id}
            time={formatCompactDate(notification.createdAt)}
            title={getUserEventNotificationTitle(notification.type)}
            unread={!notification.readAt}
          />
        ))}
      </div>
      <NotificationPagination currentPage={currentPage} manageMode={manageMode} tab="buddies" totalPages={totalPages} />
    </div>
  );
}

function NotificationListItem({
  checkboxLabel,
  checkboxValue,
  formId,
  href,
  icon,
  iconClassName,
  manageMode,
  meta,
  selected,
  time,
  title,
  unread
}: {
  checkboxLabel: string;
  checkboxValue: string;
  formId: string;
  href: string;
  icon: ReactNode;
  iconClassName: string;
  manageMode: boolean;
  meta?: string;
  selected: boolean;
  time: string;
  title: string;
  unread: boolean;
}) {
  const content = (
    <div className="min-w-0 flex-1">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {unread ? <span aria-label="未读" className="size-2 shrink-0 rounded-full bg-coral" title="未读" /> : null}
          <p className={cn("truncate text-sm text-ink", unread ? "font-black" : "font-bold")}>{title}</p>
        </div>
        <time className="shrink-0 text-xs font-semibold tabular-nums text-slate-400">{time}</time>
        </div>
      {meta ? <p className="mt-2 text-xs font-bold text-sky-600">{meta}</p> : null}
    </div>
  );

  return (
    <article
      className={cn(
        "border-b border-slate-100 px-4 py-4 transition",
        selected ? "bg-sky-50" : unread ? "bg-sky-50/35" : "bg-white hover:bg-slate-50"
      )}
    >
      <div className="flex items-start gap-3">
        {manageMode ? (
          <input
            aria-label={checkboxLabel}
            className="mt-3 size-4 shrink-0 accent-teal"
            form={formId}
            name="selectedIds"
            type="checkbox"
            value={checkboxValue}
          />
        ) : (
          <span className={cn("grid size-10 shrink-0 place-items-center rounded-lg", iconClassName)}>{icon}</span>
        )}
        {manageMode ? content : (
          <Link className="min-w-0 flex-1 outline-none focus-visible:ring-2 focus-visible:ring-teal/20" href={href}>
            {content}
          </Link>
        )}
      </div>
    </article>
  );
}

function NotificationDetailPanel({
  actions,
  contentHtml,
  icon,
  sentAt,
  title
}: {
  actions?: ReactNode;
  contentHtml?: string;
  icon?: ReactNode;
  sentAt?: Date;
  title?: string;
}) {
  if (!title || !contentHtml || !sentAt) {
    return (
      <div className="grid min-h-[620px] place-items-center px-8 text-center">
        <div>
          <span className="mx-auto grid size-16 place-items-center rounded-lg bg-slate-100 text-slate-300">
            <Inbox size={32} />
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[620px]">
      <header className="border-b border-slate-200 px-8 py-7">
        <div className="flex items-start gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-sky-50 text-sky-600">{icon}</span>
          <div className="min-w-0">
            <h2 className="break-words text-2xl font-black leading-9 text-ink">{title}</h2>
            <time className="mt-2 block text-sm font-semibold tabular-nums text-slate-400" dateTime={sentAt.toISOString()}>
              {formatDateTime(sentAt)}
            </time>
          </div>
        </div>
      </header>
      <div className="px-8 py-8">
        <div
          className="notification-rich-text max-w-none break-words text-base leading-8 text-slate-700 [&_a]:font-semibold [&_a]:text-teal [&_blockquote]:border-l-4 [&_blockquote]:border-slate-300 [&_blockquote]:pl-4 [&_h1]:text-2xl [&_h1]:font-black [&_h2]:text-xl [&_h2]:font-black [&_h3]:text-lg [&_h3]:font-bold [&_img]:my-4 [&_img]:h-auto [&_img]:max-w-full [&_li]:ml-5 [&_ol]:list-decimal [&_p]:my-2 [&_ul]:list-disc"
          dangerouslySetInnerHTML={{ __html: contentHtml }}
        />
        {actions ? <div className="mt-8 border-t border-slate-200 pt-6">{actions}</div> : null}
      </div>
    </div>
  );
}

function BuddyNotificationActions({ notification, userId }: { notification: BuddyNotification; userId: string }) {
  const request = notification.request;
  if (!request) {
    return null;
  }
  const actionable = request.status === "pending" && request.recipientId === userId && request.expiresAt > new Date();
  if (!actionable) {
    return <p className="text-sm font-bold text-slate-500">当前状态：{requestStatusText(request.status, request.expiresAt)}</p>;
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <form action={acceptRequestFromNotification}>
        <input name="requestId" type="hidden" value={request.id} />
        <button className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-teal px-4 text-sm font-black text-white transition hover:bg-teal/90" type="submit">
          <UserCheck size={17} />
          接受申请
        </button>
      </form>
      <form action={rejectRequestFromNotification}>
        <input name="requestId" type="hidden" value={request.id} />
        <button className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-coral/30 bg-white px-4 text-sm font-black text-coral transition hover:bg-coral/10" type="submit">
          <UserX size={17} />
          拒绝
        </button>
      </form>
    </div>
  );
}

function NotificationPagination({
  currentPage,
  manageMode,
  tab,
  totalPages
}: {
  currentPage: number;
  manageMode: boolean;
  tab: NotificationTab;
  totalPages: number;
}) {
  if (totalPages <= 1) {
    return null;
  }
  const pageNumbers = getVisiblePageNumbers(currentPage, totalPages);
  return (
    <nav className="flex flex-wrap items-center justify-center gap-2 border-t border-slate-200 px-4 py-4" aria-label="消息分页">
      {pageNumbers.map((pageNumber, index) => pageNumber === "ellipsis" ? (
        <span key={`ellipsis-${index}`} className="grid size-9 place-items-center text-sm text-slate-400">...</span>
      ) : (
        <Link
          key={pageNumber}
          aria-current={pageNumber === currentPage ? "page" : undefined}
          className={cn(
            "grid size-9 place-items-center rounded-lg text-sm font-bold transition",
            pageNumber === currentPage
              ? "bg-sky-600 text-white"
              : "border border-slate-200 bg-white text-slate-600 hover:border-sky-300 hover:text-sky-600"
          )}
          href={`/notifications?tab=${tab}&page=${pageNumber}${manageMode ? "&manage=1" : ""}`}
        >
          {pageNumber}
        </Link>
      ))}
    </nav>
  );
}

function EmptyList({ label }: { label: string }) {
  return (
    <div className="grid min-h-[430px] place-items-center px-6 text-center">
      <div>
        <span className="mx-auto grid size-14 place-items-center rounded-lg bg-slate-100 text-slate-300">
          <Inbox size={28} />
        </span>
        <p className="mt-4 text-sm font-bold text-slate-500">{label}</p>
      </div>
    </div>
  );
}

function buddyNotificationIcon(type: BuddyNotification["type"], size: number) {
  if (type === "buddy_post_liked") return <Heart size={size} />;
  if (type === "buddy_post_reposted") return <Repeat2 size={size} />;
  if (type === "buddy_request_accepted") return <UserCheck size={size} />;
  if (type === "buddy_request_rejected") return <UserX size={size} />;
  return <UserPlus size={size} />;
}

function buddyNotificationIconClass(type: BuddyNotification["type"]) {
  if (type === "buddy_post_liked") return "bg-pink-50 text-pink-500";
  if (type === "buddy_post_reposted") return "bg-teal/10 text-teal";
  if (type === "buddy_request_accepted") return "bg-emerald-50 text-emerald-600";
  if (type === "buddy_request_rejected") return "bg-coral/10 text-coral";
  return "bg-sky-50 text-sky-600";
}

function getActiveTab(tab?: string): NotificationTab {
  return tab === "buddies" ? "buddies" : "system";
}

function parsePage(value?: string) {
  const page = Number(value || 1);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function getVisiblePageNumbers(currentPage: number, totalPages: number): Array<number | "ellipsis"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  const sorted = Array.from(pages).filter((page) => page > 0 && page <= totalPages).sort((left, right) => left - right);
  const result: Array<number | "ellipsis"> = [];
  sorted.forEach((page, index) => {
    if (index > 0 && page - sorted[index - 1] > 1) {
      result.push("ellipsis");
    }
    result.push(page);
  });
  return result;
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

function formatCompactDate(date: Date) {
  const now = new Date();
  const beijingDate = date.toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" });
  const beijingToday = now.toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" });
  if (beijingDate === beijingToday) {
    return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Shanghai" });
  }
  return date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit", timeZone: "Asia/Shanghai" });
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

async function markAllNotificationsRead(formData: FormData) {
  "use server";
  const user = await requireUser();
  const tab = getActiveTab(String(formData.get("tab") || "system"));
  const page = parsePage(String(formData.get("page") || "1"));
  await prisma.$transaction([
    prisma.notificationRecipient.updateMany({
      where: { userId: user.id, readAt: null, notification: { status: "sent" } },
      data: { readAt: new Date() }
    }),
    prisma.userEventNotification.updateMany({
      where: { recipientId: user.id, readAt: null },
      data: { readAt: new Date() }
    })
  ]);
  revalidatePath("/learn");
  revalidatePath("/notifications");
  redirect(`/notifications?tab=${tab}&page=${page}`);
}

async function deleteSelectedNotifications(formData: FormData) {
  "use server";
  const user = await requireUser();
  const tab = getActiveTab(String(formData.get("tab") || "system"));
  const page = parsePage(String(formData.get("page") || "1"));
  const manageMode = String(formData.get("manage") || "") === "1";
  const selectedIds = Array.from(new Set(
    formData.getAll("selectedIds").map((value) => String(value).trim()).filter(Boolean)
  ));

  if (selectedIds.length > 0) {
    if (tab === "system") {
      await prisma.notificationRecipient.deleteMany({ where: { id: { in: selectedIds }, userId: user.id } });
    } else {
      await prisma.userEventNotification.deleteMany({ where: { id: { in: selectedIds }, recipientId: user.id } });
    }
  }

  revalidatePath("/learn");
  revalidatePath("/notifications");
  redirect(`/notifications?tab=${tab}&page=${page}${manageMode ? "&manage=1" : ""}`);
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
