import { Heart, Repeat2, Send, Trash2, UsersRound } from "lucide-react";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { StudentSidebar } from "@/components/student-sidebar";
import {
  createBuddyPost,
  deleteBuddyPost,
  likeBuddyPost,
  listBuddyFeed,
  repostBuddyPost,
  unlikeBuddyPost
} from "@/lib/buddy-posts";
import { formatBuddyError } from "@/lib/buddies";
import { requireUser } from "@/lib/auth";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type BuddyFeedItem = Awaited<ReturnType<typeof listBuddyFeed>>["items"][number];

const errorText: Record<string, string> = {
  BUDDY_POST_EMPTY: "动态内容不能为空。",
  BUDDY_POST_NOT_VISIBLE: "这条动态当前不可互动。",
  BUDDY_POST_SELF_LIKE_NOT_ALLOWED: "不能点赞自己的动态。",
  BUDDY_POST_SELF_REPOST_NOT_ALLOWED: "不能转帖自己的动态。",
  BUDDY_POST_REPOST_ALREADY_EXISTS: "你已经转帖过这条动态。",
  BUDDY_POST_REPOST_SOURCE_UNAVAILABLE: "原动态当前不可转帖。",
  UNKNOWN: "操作失败，请稍后再试。"
};

export default async function BuddyCirclePage({
  searchParams
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const feed = await listBuddyFeed(user.id, { limit: 30 });

  return (
    <main className="min-h-dvh bg-mist/60 lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      <StudentSidebar active="buddy-circle" />

      <section className="min-w-0 px-5 py-8 lg:px-8">
        <div className="mx-auto max-w-3xl space-y-5">
          <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-soft">
            <div className="flex items-center gap-3">
              <span className="grid size-12 place-items-center rounded-2xl bg-teal/10 text-teal">
                <UsersRound size={24} />
              </span>
              <div>
                <h1 className="text-2xl font-black text-ink">搭子圈</h1>
                <p className="mt-1 text-sm font-semibold text-slate-500">只看你和当前搭子的文字动态。</p>
              </div>
            </div>
          </header>

          {params?.error ? (
            <p className="rounded-xl bg-coral/10 px-4 py-3 text-sm font-bold text-coral">
              {errorText[params.error] || errorText.UNKNOWN}
            </p>
          ) : null}

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
            <form action={publishPost} className="space-y-4">
              <label>
                <span className="label">发布动态</span>
                <textarea
                  className="input min-h-28 resize-y leading-7"
                  name="content"
                  placeholder="写一点今天的学习状态，可以使用文字和表情。"
                />
              </label>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold text-slate-400">仅支持纯文字、换行和表情。</p>
                <button className="primary-button" type="submit">
                  <Send size={18} />
                  发布
                </button>
              </div>
            </form>
          </section>

          <section className="space-y-4">
            {feed.items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm font-semibold text-slate-500">
                暂无动态。添加搭子后，这里会出现你们的学习近况。
              </div>
            ) : (
              feed.items.map((post) => <BuddyPostCard key={post.id} post={post} />)
            )}
          </section>
        </div>
      </section>
    </main>
  );
}

function BuddyPostCard({ post }: { post: BuddyFeedItem }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
      <div className="flex items-start gap-3">
        <ProfileAvatar user={post.author} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <a className="font-black text-ink hover:text-teal" href={`/students/${post.author.id}`}>
                {post.author.nickname}
              </a>
              <p className="mt-0.5 text-xs font-semibold text-slate-400">{formatDateTime(post.createdAt)}</p>
            </div>
            {post.canDelete ? (
              <form action={deletePost}>
                <input name="postId" type="hidden" value={post.id} />
                <button className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold text-slate-400 hover:bg-coral/10 hover:text-coral" type="submit">
                  <Trash2 size={14} />
                  删除
                </button>
              </form>
            ) : null}
          </div>

          {post.type === "original" ? (
            <p className="mt-4 whitespace-pre-wrap text-sm font-semibold leading-7 text-slate-700">{post.content}</p>
          ) : (
            <div className="mt-4 space-y-3">
              <p className="text-xs font-bold text-slate-400">转帖了 {post.originalPost?.author.nickname || "对方"} 的动态</p>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                {post.sourceState === "visible" && post.originalPost ? (
                  <>
                    <p className="text-sm font-black text-ink">{post.originalPost.author.nickname}</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-7 text-slate-600">{post.originalPost.content}</p>
                  </>
                ) : (
                  <p className="text-sm font-bold text-slate-400">
                    {post.sourceState === "deleted" ? "原内容已删除" : "原内容不可见"}
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
            <form action={post.likedByMe ? unlikePost : likePost}>
              <input name="postId" type="hidden" value={post.id} />
              <button
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-black transition",
                  post.likedByMe ? "bg-coral/10 text-coral" : "bg-slate-100 text-slate-500 hover:bg-coral/10 hover:text-coral"
                )}
                disabled={!post.canLike && !post.likedByMe}
                type="submit"
              >
                <Heart size={15} />
                {post.likedByMe ? "取消点赞" : "点赞"} {post.likeCount}
              </button>
            </form>
            {post.type === "original" ? (
              <form action={repostPost}>
                <input name="postId" type="hidden" value={post.id} />
                <button
                  className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-500 transition hover:bg-teal/10 hover:text-teal disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!post.canRepost}
                  type="submit"
                >
                  <Repeat2 size={15} />
                  转帖
                </button>
              </form>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

function ProfileAvatar({ user }: { user: BuddyFeedItem["author"] }) {
  if (user.avatarImage) {
    return <img alt={`${user.nickname} 的头像`} className="size-12 rounded-full object-cover shadow-sm" src={user.avatarImage} />;
  }
  return (
    <span className="grid size-12 shrink-0 place-items-center rounded-full bg-[#58cc02] text-lg font-black text-white shadow-sm">
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

async function publishPost(formData: FormData) {
  "use server";
  const user = await requireUser();
  try {
    await createBuddyPost(user.id, String(formData.get("content") || ""));
  } catch (error) {
    redirectWithError(error);
  }
  revalidatePath("/buddy-circle");
  redirect("/buddy-circle");
}

async function deletePost(formData: FormData) {
  "use server";
  const user = await requireUser();
  try {
    await deleteBuddyPost(user.id, String(formData.get("postId") || ""));
  } catch (error) {
    redirectWithError(error);
  }
  revalidatePath("/buddy-circle");
  redirect("/buddy-circle");
}

async function likePost(formData: FormData) {
  "use server";
  const user = await requireUser();
  try {
    await likeBuddyPost(user.id, String(formData.get("postId") || ""));
  } catch (error) {
    redirectWithError(error);
  }
  revalidatePath("/buddy-circle");
  redirect("/buddy-circle");
}

async function unlikePost(formData: FormData) {
  "use server";
  const user = await requireUser();
  try {
    await unlikeBuddyPost(user.id, String(formData.get("postId") || ""));
  } catch (error) {
    redirectWithError(error);
  }
  revalidatePath("/buddy-circle");
  redirect("/buddy-circle");
}

async function repostPost(formData: FormData) {
  "use server";
  const user = await requireUser();
  try {
    await repostBuddyPost(user.id, String(formData.get("postId") || ""));
  } catch (error) {
    redirectWithError(error);
  }
  revalidatePath("/buddy-circle");
  redirect("/buddy-circle");
}

function redirectWithError(error: unknown): never {
  const buddyError = formatBuddyError(error);
  redirect(`/buddy-circle?error=${buddyError?.code || "UNKNOWN"}`);
}
