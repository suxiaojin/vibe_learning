import { ShieldOff } from "lucide-react";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { StudentSidebar } from "@/components/student-sidebar";
import { requireUser } from "@/lib/auth";
import { listBlockedUsers, unblockUser } from "@/lib/social";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SettingsTab = "blocked-users";

const settingsTabs: Array<{ key: SettingsTab; label: string }> = [
  { key: "blocked-users", label: "屏蔽用户" }
];

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
  const blockedUsers = await listBlockedUsers(user.id);

  return (
    <main className="min-h-dvh bg-mist lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
      <StudentSidebar active="settings" />

      <section className="min-w-0 px-5 py-8 lg:px-8">
        <div className="mx-auto max-w-5xl space-y-6">
          <header className="rounded-[22px] border border-slate-200/80 bg-white px-6 py-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
            <h1 className="text-[32px] font-bold leading-tight text-ink">设置</h1>
          </header>

          <nav aria-label="设置分类" className="border-b border-slate-200">
            <div className="flex min-h-16 gap-7 overflow-x-auto px-1">
              {settingsTabs.map((tab) => {
                const active = activeTab === tab.key;
                return (
                  <a
                    key={tab.key}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "inline-flex shrink-0 items-center border-b-2 px-1 pt-1 text-sm font-semibold transition",
                      active ? "border-teal text-ink" : "border-transparent text-slate-600 hover:border-slate-300 hover:text-ink"
                    )}
                    href={`/settings?tab=${tab.key}`}
                  >
                    {tab.label}
                  </a>
                );
              })}
            </div>
          </nav>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-semibold text-ink">屏蔽用户</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {blockedUsers.items.length === 0 ? (
                <p className="px-5 py-12 text-center text-sm font-semibold text-slate-500">暂时没有屏蔽用户。</p>
              ) : (
                blockedUsers.items.map((blockedUser) => (
                  <div key={blockedUser.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
                    <a className="flex min-w-0 items-center gap-3" href={`/students/${blockedUser.id}`}>
                      <SettingsAvatar user={blockedUser} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-ink">{blockedUser.nickname}</span>
                        <span className="mt-1 block truncate text-xs font-semibold text-slate-500">
                          {[blockedUser.province, blockedUser.studySystem, blockedUser.majorName].filter(Boolean).join(" · ") || `@${blockedUser.username}`}
                        </span>
                      </span>
                    </a>
                    <form action={unblockFromSettings}>
                      <input name="targetId" type="hidden" value={blockedUser.id} />
                      <button className="secondary-button min-h-10 px-4 text-xs" type="submit">
                        <ShieldOff size={16} />
                        解除屏蔽
                      </button>
                    </form>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function SettingsAvatar({
  user
}: {
  user: { avatarColor?: string; avatarImage?: string; nickname: string };
}) {
  if (user.avatarImage) {
    return <img alt={`${user.nickname} 的头像`} className="size-12 shrink-0 rounded-full object-cover shadow-sm" src={user.avatarImage} />;
  }
  return (
    <span className="grid size-12 shrink-0 place-items-center rounded-full bg-[#58cc02] text-lg font-semibold text-white shadow-sm">
      {user.nickname.slice(0, 1).toUpperCase()}
    </span>
  );
}

function getSettingsTab(tab?: string): SettingsTab {
  return tab === "blocked-users" ? tab : "blocked-users";
}

async function unblockFromSettings(formData: FormData) {
  "use server";

  const user = await requireUser();
  await unblockUser(user.id, String(formData.get("targetId") || ""));
  revalidatePath("/settings");
  revalidatePath("/buddy-circle");
  redirect("/settings?tab=blocked-users");
}
