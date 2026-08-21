import { ShieldOff, UserCheck, UserMinus, UserPlus, UsersRound } from "lucide-react";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SocialAvatar } from "@/components/social-post-card";
import { StudentSidebar } from "@/components/student-sidebar";
import { requireUser } from "@/lib/auth";
import {
  followUser,
  listBlockedUsers,
  listFollowers,
  listFollowing,
  unblockUser,
  unfollowUser
} from "@/lib/social";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SettingsTab = "followers" | "following" | "blocked-users";

type ManagedUser = {
  id: string;
  username: string;
  nickname: string;
  avatarImage: string;
  avatarColor: string;
  province: string | null;
  studySystem: string | null;
  majorName: string | null;
  isFollowing?: boolean;
};

const settingsTabs: Array<{ key: SettingsTab; label: string }> = [
  { key: "followers", label: "我的粉丝" },
  { key: "following", label: "我的关注" },
  { key: "blocked-users", label: "屏蔽用户" }
];

const emptyStateText: Record<SettingsTab, string> = {
  followers: "还没有粉丝。",
  following: "还没有关注任何用户。",
  "blocked-users": "暂时没有屏蔽用户。"
};

export default async function SettingsPage({
  searchParams
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  const user = await requireUser();
  if (user.role !== "student") {
    redirect("/admin");
  }

  const query = await searchParams;
  const activeTab = getSettingsTab(query?.tab);
  const managedUsers: ManagedUser[] =
    activeTab === "followers"
      ? (await listFollowers(user.id)).items
      : activeTab === "following"
        ? (await listFollowing(user.id)).items
        : (await listBlockedUsers(user.id)).items;

  return (
    <main className="min-h-dvh bg-mist lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
      <StudentSidebar active="settings" />

      <section className="min-w-0 px-5 py-7 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <nav className="mb-5 text-sm font-semibold text-slate-500" aria-label="面包屑">
            <Link className="hover:text-teal" href="/learn">首页</Link>
            <span className="mx-2 text-slate-300">/</span>
            <span className="text-slate-700">用户管理</span>
          </nav>

          <section className="overflow-hidden rounded-[22px] border border-slate-200/80 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
            <header className="border-b border-slate-200 px-6 pt-6">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-lg bg-teal/10 text-teal" aria-hidden="true">
                  <UsersRound size={22} />
                </span>
                <h1 className="text-2xl font-semibold text-ink">用户管理</h1>
              </div>

              <nav className="mt-6 flex items-center gap-7 overflow-x-auto" aria-label="用户管理分类">
                {settingsTabs.map((tab) => {
                  const active = activeTab === tab.key;
                  return (
                    <Link
                      key={tab.key}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "inline-flex min-h-12 shrink-0 items-center border-b-2 px-1 text-sm font-semibold transition",
                        active
                          ? "border-teal text-teal"
                          : "border-transparent text-slate-500 hover:text-ink"
                      )}
                      href={`/settings?tab=${tab.key}`}
                    >
                      {tab.label}
                    </Link>
                  );
                })}
              </nav>
            </header>

            <section className="min-h-[420px]" aria-label={settingsTabs.find((tab) => tab.key === activeTab)?.label}>
              {managedUsers.length === 0 ? (
                <div className="grid min-h-[420px] place-items-center px-6 py-12 text-center">
                  <div>
                    <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-slate-100 text-slate-300" aria-hidden="true">
                      <UsersRound size={28} />
                    </span>
                    <p className="mt-4 text-sm font-semibold text-slate-500">{emptyStateText[activeTab]}</p>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {managedUsers.map((managedUser) => (
                    <article key={managedUser.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-6">
                      <div className="flex min-w-0 items-center gap-3">
                        <SocialAvatar href={`/students/${managedUser.id}`} user={managedUser} />
                        <Link className="min-w-0 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/40" href={`/students/${managedUser.id}`}>
                          <span className="block truncate text-sm font-semibold text-ink">{managedUser.nickname}</span>
                          <span className="mt-1 block truncate text-xs font-semibold text-slate-500">
                            {[managedUser.province, managedUser.studySystem, managedUser.majorName].filter(Boolean).join(" · ") || `@${managedUser.username}`}
                          </span>
                        </Link>
                      </div>

                      <ManagedUserAction activeTab={activeTab} user={managedUser} />
                    </article>
                  ))}
                </div>
              )}
            </section>
          </section>
        </div>
      </section>
    </main>
  );
}

function ManagedUserAction({
  activeTab,
  user
}: {
  activeTab: SettingsTab;
  user: ManagedUser;
}) {
  if (activeTab === "blocked-users") {
    return (
      <form action={unblockFromSettings}>
        <input name="targetId" type="hidden" value={user.id} />
        <button className="secondary-button min-h-11 px-4 text-xs" type="submit">
          <ShieldOff size={16} />
          解除屏蔽
        </button>
      </form>
    );
  }

  if (activeTab === "followers") {
    if (!user.isFollowing) {
      return (
        <form action={followFromSettings}>
          <input name="targetId" type="hidden" value={user.id} />
          <button className="primary-button min-h-11 px-4 text-xs" type="submit">
            <UserPlus size={16} />
            回关
          </button>
        </form>
      );
    }

    return (
      <span className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 text-xs font-semibold text-slate-500">
        <UserCheck size={16} />
        已关注
      </span>
    );
  }

  return (
    <form action={unfollowFromSettings}>
      <input name="returnTab" type="hidden" value={activeTab} />
      <input name="targetId" type="hidden" value={user.id} />
      <button className="secondary-button min-h-11 px-4 text-xs" type="submit">
        <UserMinus size={16} />
        取消关注
      </button>
    </form>
  );
}

function getSettingsTab(tab?: string): SettingsTab {
  if (tab === "following" || tab === "blocked-users") {
    return tab;
  }
  return "followers";
}

function revalidateUserManagement(targetId: string) {
  revalidatePath("/settings");
  revalidatePath("/buddy-circle");
  revalidatePath(`/students/${targetId}`);
}

async function followFromSettings(formData: FormData) {
  "use server";

  const user = await requireUser();
  const targetId = String(formData.get("targetId") || "");
  await followUser(user.id, targetId);
  revalidateUserManagement(targetId);
  redirect("/settings?tab=followers");
}

async function unfollowFromSettings(formData: FormData) {
  "use server";

  const user = await requireUser();
  const targetId = String(formData.get("targetId") || "");
  const returnTab = getSettingsTab(String(formData.get("returnTab") || ""));
  await unfollowUser(user.id, targetId);
  revalidateUserManagement(targetId);
  redirect(`/settings?tab=${returnTab}`);
}

async function unblockFromSettings(formData: FormData) {
  "use server";

  const user = await requireUser();
  const targetId = String(formData.get("targetId") || "");
  await unblockUser(user.id, targetId);
  revalidateUserManagement(targetId);
  redirect("/settings?tab=blocked-users");
}
