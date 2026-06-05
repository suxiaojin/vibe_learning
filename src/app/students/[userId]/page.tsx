import { ArrowLeft, Gem, Medal, UserPlus, UserRound, UsersRound, XCircle } from "lucide-react";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { StudentSidebar } from "@/components/student-sidebar";
import { listProfileBuddyPosts } from "@/lib/buddy-posts";
import {
  acceptBuddyRequest,
  createBuddyRequest,
  formatBuddyError,
  getPublicStudentProfile,
  rejectBuddyRequest,
  removeBuddy,
  withdrawBuddyRequest
} from "@/lib/buddies";
import { requireUser } from "@/lib/auth";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ProfilePost = Awaited<ReturnType<typeof listProfileBuddyPosts>>["items"][number];

const errorText: Record<string, string> = {
  BUDDY_REQUEST_PENDING: "申请已发送，等待对方处理。",
  BUDDY_REQUEST_REVERSED_PENDING: "对方已经申请你为搭子，请直接处理现有申请。",
  BUDDY_RELATIONSHIP_TERMINATED: "双方已经不能再次建立搭子关系。",
  BUDDY_REQUEST_WITHDRAW_COOLDOWN: "撤回申请后 30 天内不能再次申请该用户。",
  BUDDY_REQUEST_NOT_ACTIONABLE: "该申请当前不能处理。",
  BUDDY_ALREADY_ACTIVE: "你们已经是搭子了。",
  UNKNOWN: "操作失败，请稍后再试。"
};

export default async function StudentProfilePage({
  params,
  searchParams
}: {
  params: Promise<{ userId: string }>;
  searchParams?: Promise<{ error?: string }>;
}) {
  const currentUser = await requireUser();
  if (currentUser.role !== "student") {
    redirect("/admin");
  }
  const { userId } = await params;
  const query = await searchParams;
  const profile = await getPublicStudentProfile(currentUser.id, userId);
  const posts = profile.canViewPosts ? await listProfileBuddyPosts(currentUser.id, userId, { limit: 20 }) : { items: [], nextCursor: null };

  return (
    <main className="min-h-dvh bg-mist/60 lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      <StudentSidebar active="me" />

      <section className="min-w-0 px-5 py-8 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-5">
          <a className="inline-flex items-center gap-2 text-sm font-black text-slate-500 hover:text-teal" href="/me?tab=buddies">
            <ArrowLeft size={17} />
            返回我的搭子
          </a>

          {query?.error ? (
            <p className="rounded-xl bg-coral/10 px-4 py-3 text-sm font-bold text-coral">
              {errorText[query.error] || errorText.UNKNOWN}
            </p>
          ) : null}

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-soft">
            <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
              <div className="flex min-w-0 items-center gap-4">
                <ProfileAvatar user={profile.user} />
                <div className="min-w-0">
                  <h1 className="truncate text-3xl font-black text-ink">{profile.user.nickname}</h1>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-semibold text-slate-500">
                    <span>{profile.user.joinedYear} 年加入</span>
                    <span className="flex items-center gap-1"><Gem size={16} className="text-sky-500" />{profile.user.diamondBalance} 钻石</span>
                    <span className="flex items-center gap-1"><Medal size={16} className="text-honey" />{profile.user.medalLabel}</span>
                    <span>性别：{profile.user.gender === "male" ? "男" : profile.user.gender === "female" ? "女" : "未填写"}</span>
                  </div>
                </div>
              </div>
              <RelationshipAction targetId={profile.user.id} relationship={profile.relationship} />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
            <div className="mb-4 flex items-center gap-2">
              <UsersRound className="text-teal" size={20} />
              <h2 className="text-lg font-black text-ink">动态</h2>
            </div>
            {!profile.canViewPosts ? (
              <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm font-semibold text-slate-500">
                成为搭子后才能查看 TA 的动态。
              </p>
            ) : posts.items.length === 0 ? (
              <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm font-semibold text-slate-500">
                暂无动态。
              </p>
            ) : (
              <div className="space-y-4">
                {posts.items.map((post) => <ProfilePostCard key={post.id} post={post} />)}
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}

function RelationshipAction({
  relationship,
  targetId
}: {
  relationship: Awaited<ReturnType<typeof getPublicStudentProfile>>["relationship"];
  targetId: string;
}) {
  const returnTo = `/students/${targetId}`;

  if (relationship.action === "self") {
    return <span className="badge bg-slate-100 text-slate-500">这是你自己</span>;
  }
  if (relationship.action === "none") {
    return (
      <form action={sendBuddyRequest}>
        <input name="targetId" type="hidden" value={targetId} />
        <input name="returnTo" type="hidden" value={returnTo} />
        <button className="primary-button" type="submit">
          <UserPlus size={18} />
          添加搭子
        </button>
      </form>
    );
  }
  if (relationship.action === "outgoing_pending" && relationship.requestId) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="badge bg-sky-50 text-sky-700">等待对方处理</span>
        <form action={withdrawRequest}>
          <input name="requestId" type="hidden" value={relationship.requestId} />
          <input name="returnTo" type="hidden" value={returnTo} />
          <button className="secondary-button min-h-10 px-4 text-xs" type="submit">撤回申请</button>
        </form>
      </div>
    );
  }
  if (relationship.action === "incoming_pending" && relationship.requestId) {
    return (
      <div className="flex flex-wrap gap-2">
        <form action={acceptRequest}>
          <input name="requestId" type="hidden" value={relationship.requestId} />
          <input name="returnTo" type="hidden" value={returnTo} />
          <button className="primary-button min-h-10 px-4 text-xs" type="submit">接受申请</button>
        </form>
        <form action={rejectRequest}>
          <input name="requestId" type="hidden" value={relationship.requestId} />
          <input name="returnTo" type="hidden" value={returnTo} />
          <button className="secondary-button min-h-10 px-4 text-xs text-coral" type="submit">拒绝申请</button>
        </form>
      </div>
    );
  }
  if (relationship.action === "active") {
    return (
      <form action={removeBuddyAction}>
        <input name="targetId" type="hidden" value={targetId} />
        <input name="returnTo" type="hidden" value={returnTo} />
        <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-coral px-4 text-sm font-black text-white transition hover:bg-red-500" type="submit">
          <XCircle size={18} />
          删除搭子并永久解除关系
        </button>
      </form>
    );
  }
  if (relationship.action === "outgoing_withdraw_cooldown") {
    return (
      <span className="rounded-xl bg-slate-100 px-4 py-3 text-xs font-bold text-slate-500">
        撤回冷却中，{relationship.reapplyAllowedAt ? formatDateTime(relationship.reapplyAllowedAt) : "稍后"}后可再次申请
      </span>
    );
  }
  return <span className="badge bg-slate-100 text-slate-500">无法添加</span>;
}

function ProfilePostCard({ post }: { post: ProfilePost }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black text-ink">{post.author.nickname}</p>
          <p className="mt-0.5 text-xs font-semibold text-slate-400">{formatDateTime(post.createdAt)}</p>
        </div>
      </div>
      {post.type === "original" ? (
        <p className="mt-3 whitespace-pre-wrap text-sm font-semibold leading-7 text-slate-700">{post.content}</p>
      ) : (
        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
          {post.sourceState === "visible" && post.originalPost ? (
            <>
              <p className="text-xs font-bold text-slate-400">转帖自 {post.originalPost.author.nickname}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-7 text-slate-600">{post.originalPost.content}</p>
            </>
          ) : (
            <p className="text-sm font-bold text-slate-400">
              {post.sourceState === "deleted" ? "原内容已删除" : "原内容不可见"}
            </p>
          )}
        </div>
      )}
    </article>
  );
}

function ProfileAvatar({ user }: { user: Awaited<ReturnType<typeof getPublicStudentProfile>>["user"] }) {
  if (user.avatarImage) {
    return <img alt={`${user.nickname} 的头像`} className="size-20 rounded-full object-cover shadow-sm" src={user.avatarImage} />;
  }
  return (
    <span className={cn("grid size-20 shrink-0 place-items-center rounded-full bg-[#58cc02] text-2xl font-black text-white shadow-sm")}>
      {user.nickname.slice(0, 1).toUpperCase()}
    </span>
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

async function sendBuddyRequest(formData: FormData) {
  "use server";
  const user = await requireUser();
  const targetId = String(formData.get("targetId") || "");
  try {
    await createBuddyRequest(user.id, targetId);
  } catch (error) {
    redirectWithError(formData, error);
  }
  revalidatePath("/me");
  redirect(getReturnTo(formData, `/students/${targetId}`));
}

async function acceptRequest(formData: FormData) {
  "use server";
  const user = await requireUser();
  try {
    await acceptBuddyRequest(user.id, String(formData.get("requestId") || ""));
  } catch (error) {
    redirectWithError(formData, error);
  }
  revalidatePath("/me");
  revalidatePath("/buddy-circle");
  redirect(getReturnTo(formData, "/me?tab=buddies"));
}

async function rejectRequest(formData: FormData) {
  "use server";
  const user = await requireUser();
  try {
    await rejectBuddyRequest(user.id, String(formData.get("requestId") || ""));
  } catch (error) {
    redirectWithError(formData, error);
  }
  revalidatePath("/me");
  redirect(getReturnTo(formData, "/me?tab=buddies"));
}

async function withdrawRequest(formData: FormData) {
  "use server";
  const user = await requireUser();
  try {
    await withdrawBuddyRequest(user.id, String(formData.get("requestId") || ""));
  } catch (error) {
    redirectWithError(formData, error);
  }
  revalidatePath("/me");
  redirect(getReturnTo(formData, "/me?tab=buddies"));
}

async function removeBuddyAction(formData: FormData) {
  "use server";
  const user = await requireUser();
  const targetId = String(formData.get("targetId") || "");
  try {
    await removeBuddy(user.id, targetId);
  } catch (error) {
    redirectWithError(formData, error);
  }
  revalidatePath("/me");
  revalidatePath("/buddy-circle");
  redirect(getReturnTo(formData, "/me?tab=buddies"));
}

function getReturnTo(formData: FormData, fallback: string) {
  const returnTo = String(formData.get("returnTo") || "");
  return returnTo.startsWith("/") ? returnTo : fallback;
}

function redirectWithError(formData: FormData, error: unknown): never {
  const buddyError = formatBuddyError(error);
  const returnTo = getReturnTo(formData, "/me?tab=buddies");
  const separator = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${separator}error=${buddyError?.code || "UNKNOWN"}`);
}
