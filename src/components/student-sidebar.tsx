import type { ReactNode } from "react";
import Link from "next/link";
import { Bell, BookMarked, Gem, GraduationCap, HelpCircle, LogOut, MoreHorizontal, Settings, Sparkles, UserRound, UsersRound } from "lucide-react";
import { NotificationBell } from "@/components/notification-bell";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureDiamondAccount } from "@/lib/rewards";
import { getNotificationBellData } from "@/lib/user-event-notifications";
import { cn } from "@/lib/utils";

type StudentNavKey = "learn" | "course-center" | "study-buddy" | "buddy-circle" | "me" | "notifications" | "settings";

const text = {
  subtitle: "\u4e13\u8f6c\u672c\u95ef\u5173\u5b66\u4e60",
  learn: "\u5b66\u4e60",
  courseCenter: "\u8bfe\u7a0b\u4e2d\u5fc3",
  studyBuddy: "上岸搭子",
  buddyCircle: "搭子圈",
  profile: "\u4e2a\u4eba\u6863\u6848",
  more: "\u66f4\u591a",
  moreTitle: "\u66f4\u591a\u529f\u80fd",
  moreHint: "\u901a\u77e5\u3001\u8bbe\u7f6e\u548c\u5e2e\u52a9",
  notifications: "\u901a\u77e5",
  settings: "\u8bbe\u7f6e",
  help: "\u5e2e\u52a9",
  logout: "\u9000\u51fa\u767b\u5f55"
};

export async function StudentSidebar({ active }: { active: StudentNavKey }) {
  const footer = await getStudentSidebarAccount();

  return (
    <aside className="relative z-[100] hidden border-r border-slate-200/80 bg-white lg:block">
      <div className="sticky top-0 flex min-h-dvh flex-col px-5 py-6">
        <div className="mb-8 px-2">
          <p className="text-[28px] font-bold leading-tight text-teal">Vibe Learning</p>
          <p className="mt-1 text-[13px] font-medium text-slate-500">{text.subtitle}</p>
        </div>
        <nav className="space-y-2.5">
          <StudentNavItem active={active === "learn"} href="/learn" icon={<GraduationCap size={22} />} label={text.learn} />
          <StudentNavItem active={active === "course-center"} href="/course-center" icon={<BookMarked size={22} />} label={text.courseCenter} />
          <StudentNavItem active={active === "study-buddy"} href="/study-buddy" icon={<Sparkles size={22} />} label={text.studyBuddy} />
          <StudentNavItem active={active === "buddy-circle"} href="/buddy-circle" icon={<UsersRound size={22} />} label={text.buddyCircle} />
          <StudentNavItem active={active === "me"} href="/me" icon={<UserRound size={22} />} label={text.profile} />
          <MoreMenu active={active === "notifications" || active === "settings"} />
        </nav>
        <div className="mt-auto px-1 pt-6">{footer}</div>
      </div>
    </aside>
  );
}

async function getStudentSidebarAccount() {
  const user = await requireUser();
  const [diamondAccount, fullUser, notificationBellData] = await Promise.all([
    ensureDiamondAccount(user.id),
    prisma.user.findUnique({
      where: { id: user.id },
      include: { studentProfile: true }
    }),
    getNotificationBellData(user.id)
  ]);
  const displayName = fullUser?.studentProfile?.nickname || user.username;
  const avatarImage = fullUser?.studentProfile?.avatarImage || "";

  return (
    <div className="flex items-center gap-5">
      <SidebarAvatar image={avatarImage} name={displayName} />
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

function SidebarAvatar({ image, name }: { image: string; name: string }) {
  const className = "size-14 rounded-full object-cover shadow-sm";
  if (image) {
    return <Link href="/me?tab=homepage"><img alt={`${name} 的头像`} className={className} src={image} /></Link>;
  }

  return (
    <Link className="grid size-14 place-items-center rounded-full bg-[#58cc02] text-xl font-semibold text-white shadow-sm" href="/me?tab=homepage">
      {name.slice(0, 1).toUpperCase()}
    </Link>
  );
}

function StudentNavItem({
  href,
  icon,
  label,
  active = false
}: {
  href: string;
  icon: ReactNode;
  label: string;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex min-h-[52px] items-center gap-3 rounded-2xl border px-4 text-base font-semibold transition",
        active ? "border-teal/30 bg-teal/10 text-teal shadow-[0_10px_26px_rgba(31,157,138,0.10)]" : "border-transparent text-slate-600 hover:bg-slate-100 hover:text-ink"
      )}
    >
      <span className="grid size-7 place-items-center">{icon}</span>
      {label}
    </Link>
  );
}

function MoreMenu({ active }: { active: boolean }) {
  return (
    <div className="group relative">
      <button
        className={cn(
          "flex min-h-[52px] w-full items-center gap-3 rounded-2xl border px-4 text-left text-base font-semibold transition group-hover:bg-slate-100",
          active ? "border-teal/30 bg-teal/10 text-teal shadow-[0_10px_26px_rgba(31,157,138,0.10)]" : "border-transparent text-slate-600 hover:bg-slate-100 hover:text-ink"
        )}
        type="button"
      >
        <span className="grid size-7 place-items-center">
          <MoreHorizontal size={20} />
        </span>
        {text.more}
      </button>

      <div className="invisible absolute bottom-0 left-full z-[120] w-56 translate-x-2 pl-2 opacity-0 transition duration-150 group-hover:visible group-hover:translate-x-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-x-0 group-focus-within:opacity-100">
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
          <button className="flex w-full items-center gap-3 px-5 py-3 text-left text-sm font-semibold text-slate-500 hover:bg-slate-50" type="button">
            <HelpCircle size={18} />
            {text.help}
          </button>
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
