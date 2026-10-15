import type { ReactNode } from "react";
import Link from "next/link";
import { Bell, BookMarked, Gem, GraduationCap, HelpCircle, LogOut, MoreHorizontal, Settings, Sparkles, UserRound, UsersRound } from "lucide-react";
import { NotificationBell } from "@/components/notification-bell";
import { StudentSidebarAvatar } from "@/components/student-sidebar-avatar";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureDiamondAccount } from "@/lib/rewards";
import { hasUnreadDiscoveryFeedPosts } from "@/lib/buddy-posts";
import { getNotificationBellData } from "@/lib/user-event-notifications";
import { getSystemSettings } from "@/lib/system-settings";
import { hasUnreadChangelogs } from "@/lib/changelog-read-state";
import { cn } from "@/lib/utils";

type StudentNavKey = "learn" | "course-center" | "study-buddy" | "buddy-circle" | "me" | "notifications" | "settings" | "help";

const text = {
  learn: "\u5b66\u4e60",
  courseCenter: "\u8bfe\u7a0b\u4e2d\u5fc3",
  studyBuddy: "学习搭子",
  buddyCircle: "一起上岸",
  profile: "\u4e2a\u4eba\u6863\u6848",
  more: "\u66f4\u591a",
  moreTitle: "\u66f4\u591a\u529f\u80fd",
  moreHint: "\u901a\u77e5\u3001\u8bbe\u7f6e\u548c\u5e2e\u52a9\u4e2d\u5fc3",
  notifications: "\u901a\u77e5",
  settings: "\u8bbe\u7f6e",
  help: "\u5e2e\u52a9\u4e2d\u5fc3",
  logout: "\u9000\u51fa\u767b\u5f55"
};

export async function StudentSidebar({
  active,
  hideBuddyCircleUnread = false,
  hideChangelogUnread = false
}: {
  active: StudentNavKey;
  hideBuddyCircleUnread?: boolean;
  hideChangelogUnread?: boolean;
}) {
  const user = await requireUser();
  const [footer, navIcons, hasUnreadDiscoveryPosts, hasUnreadChangelogEntries] = await Promise.all([
    getStudentSidebarAccount(user),
    getSystemSettings([
      "studentNavIconLearnKey",
      "studentNavIconCourseCenterKey",
      "studentNavIconStudyBuddyKey",
      "studentNavIconBuddyCircleKey",
      "studentNavIconProfileKey",
      "studentNavIconMoreKey"
    ]),
    user.role === "student" && !hideBuddyCircleUnread ? hasUnreadDiscoveryFeedPosts(user.id) : Promise.resolve(false),
    user.role === "student" && !hideChangelogUnread ? hasUnreadChangelogs(user.id) : Promise.resolve(false)
  ]);

  return (
    <aside className="hidden border-r border-slate-200/80 bg-white lg:block">
      <div className="sticky top-0 flex min-h-dvh flex-col px-5 py-6">
        <div className="mb-8 px-2">
          <p className="text-[28px] font-bold leading-tight text-teal">Vibe Learning</p>
        </div>
        <nav className="space-y-2.5">
          <StudentNavItem active={active === "learn"} href="/learn" icon={<StudentNavIcon fallback={<GraduationCap size={22} />} iconKey="learn" storageKey={navIcons.studentNavIconLearnKey} />} label={text.learn} />
          <StudentNavItem active={active === "course-center"} href="/course-center" icon={<StudentNavIcon fallback={<BookMarked size={22} />} iconKey="course-center" storageKey={navIcons.studentNavIconCourseCenterKey} />} label={text.courseCenter} />
          <StudentNavItem active={active === "study-buddy"} href="/study-buddy" icon={<StudentNavIcon fallback={<Sparkles size={22} />} iconKey="study-buddy" storageKey={navIcons.studentNavIconStudyBuddyKey} />} label={text.studyBuddy} />
          <StudentNavItem active={active === "buddy-circle"} href="/buddy-circle" icon={<StudentNavIcon fallback={<UsersRound size={22} />} iconKey="buddy-circle" storageKey={navIcons.studentNavIconBuddyCircleKey} />} label={text.buddyCircle} unread={hasUnreadDiscoveryPosts && !hideBuddyCircleUnread} />
          <StudentNavItem active={active === "me"} href="/me" icon={<StudentNavIcon fallback={<UserRound size={22} />} iconKey="profile" storageKey={navIcons.studentNavIconProfileKey} />} label={text.profile} />
          <MoreMenu
            active={active === "notifications" || active === "settings" || active === "help"}
            icon={<StudentNavIcon fallback={<MoreHorizontal size={20} />} iconKey="more" storageKey={navIcons.studentNavIconMoreKey} />}
            unreadChangelog={hasUnreadChangelogEntries && !hideChangelogUnread}
          />
        </nav>
        <div className="mt-auto px-1 pt-6">{footer}</div>
      </div>
    </aside>
  );
}

function StudentNavIcon({
  fallback,
  iconKey,
  storageKey
}: {
  fallback: ReactNode;
  iconKey: string;
  storageKey: string;
}) {
  if (!storageKey) return fallback;

  return (
    <img
      alt=""
      aria-hidden="true"
      className="size-6 object-contain"
      height={24}
      src={`/api/student-nav-icons/${iconKey}?v=${encodeURIComponent(storageKey)}`}
      width={24}
    />
  );
}

async function getStudentSidebarAccount(user: Awaited<ReturnType<typeof requireUser>>) {
  const [diamondAccount, fullUser, notificationBellData] = await Promise.all([
    ensureDiamondAccount(user.id),
    prisma.user.findUnique({
      where: { id: user.id },
      select: {
        studentProfile: {
          select: { avatarImage: true, nickname: true }
        }
      }
    }),
    getNotificationBellData(user.id)
  ]);
  const displayName = fullUser?.studentProfile?.nickname || user.username;
  const avatarImage = fullUser?.studentProfile?.avatarImage || "";

  return (
    <div className="flex items-center gap-5">
      <StudentSidebarAvatar image={avatarImage} name={displayName} />
      <Link
        aria-label={`我的钻石，${diamondAccount.balance} 个`}
        className="relative grid size-11 place-items-center rounded-full text-sky-500 transition hover:text-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-200"
        href="/me?tab=diamonds"
        title="我的钻石"
      >
        <Gem size={28} />
        <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-coral px-1.5 py-0.5 text-center text-[11px] font-black leading-none text-white shadow-sm">
          {diamondAccount.balance > 999 ? "999+" : diamondAccount.balance}
        </span>
      </Link>
      <NotificationBell
        notifications={notificationBellData.notifications}
        panelPlacement="top-start"
        triggerStyle="plain"
        unreadCount={notificationBellData.unreadCount}
      />
    </div>
  );
}

function StudentNavItem({
  href,
  icon,
  label,
  active = false,
  unread = false
}: {
  href: string;
  icon: ReactNode;
  label: string;
  active?: boolean;
  unread?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label={unread ? `${label}，发现有未读帖子` : undefined}
      className={cn(
        "flex min-h-[52px] items-center gap-3 rounded-2xl border px-4 text-base font-semibold transition",
        active ? "border-teal/30 bg-teal/10 text-teal shadow-[0_10px_26px_rgba(31,157,138,0.10)]" : "border-transparent text-slate-600 hover:bg-slate-100 hover:text-ink"
      )}
    >
      <span className="relative grid size-7 place-items-center">
        {icon}
        {unread ? <span aria-hidden="true" className="absolute right-0 top-0 size-2 rounded-full bg-coral ring-2 ring-white" /> : null}
      </span>
      {label}
    </Link>
  );
}

function MoreMenu({ active, icon, unreadChangelog }: { active: boolean; icon: ReactNode; unreadChangelog: boolean }) {
  return (
    <div className="group relative">
      <button
        aria-label={unreadChangelog ? "更多，有未读更新日志" : undefined}
        className={cn(
          "flex min-h-[52px] w-full items-center gap-3 rounded-2xl border px-4 text-left text-base font-semibold transition group-hover:bg-slate-100",
          active ? "border-teal/30 bg-teal/10 text-teal shadow-[0_10px_26px_rgba(31,157,138,0.10)]" : "border-transparent text-slate-600 hover:bg-slate-100 hover:text-ink"
        )}
        type="button"
      >
        <span className="relative grid size-7 place-items-center">
          {icon}
          {unreadChangelog ? <span aria-hidden="true" className="absolute right-0 top-0 size-2 rounded-full bg-coral ring-2 ring-white" /> : null}
        </span>
        {text.more}
      </button>

      <div className="invisible absolute bottom-0 left-full z-40 w-56 translate-x-2 pl-2 opacity-0 transition duration-150 group-hover:visible group-hover:translate-x-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-x-0 group-focus-within:opacity-100">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white py-2 shadow-[0_8px_28px_rgba(15,23,42,0.16)]">
          <div className="border-b border-slate-200 px-5 py-3">
            <p className="text-sm font-semibold text-slate-700">{text.moreTitle}</p>
            <p className="mt-1 text-xs font-medium text-slate-400">{text.moreHint}</p>
          </div>
          <Link className="flex w-full items-center gap-3 px-5 py-3 text-left text-sm font-semibold text-slate-600 hover:bg-slate-50" href="/notifications">
            <Bell size={18} />
            {text.notifications}
          </Link>
          <Link className="flex w-full items-center gap-3 px-5 py-3 text-left text-sm font-semibold text-slate-500 hover:bg-slate-50" href="/settings?tab=blocked-users">
            <Settings size={18} />
            {text.settings}
          </Link>
          <Link className="flex w-full items-center justify-between px-5 py-3 text-left text-sm font-semibold text-slate-500 hover:bg-slate-50" href="/help">
            <span className="flex items-center gap-3"><HelpCircle size={18} />{text.help}</span>
            {unreadChangelog ? <span aria-label="有未读更新日志" className="size-2 shrink-0 rounded-full bg-coral" /> : null}
          </Link>
          <form action="/api/auth/logout" method="post">
            <button className="flex w-full items-center gap-3 px-5 py-3 text-left text-sm font-semibold text-slate-500 hover:bg-slate-50" type="submit">
              <LogOut size={18} />
              {text.logout}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
