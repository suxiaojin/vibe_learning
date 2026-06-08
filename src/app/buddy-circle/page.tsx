import { Heart, Repeat2, Search, Send, SlidersHorizontal, Trash2, UserCheck, UserPlus, UsersRound } from "lucide-react";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { StudentSidebar } from "@/components/student-sidebar";
import {
  createBuddyPost,
  deleteBuddyPost,
  likeBuddyPost,
  listBuddyFeed,
  repostBuddyPost,
  unlikeBuddyPost,
  type BuddyFeedScope,
  type BuddyFeedSort
} from "@/lib/buddy-posts";
import { formatBuddyError } from "@/lib/buddies";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { followUser, searchUsersByNickname, unfollowUser, type SocialUserSearchResult } from "@/lib/social";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type BuddyFeedItem = Awaited<ReturnType<typeof listBuddyFeed>>["items"][number];

const errorText: Record<string, string> = {
  BUDDY_POST_EMPTY: "动态内容不能为空。",
  BUDDY_POST_NOT_VISIBLE: "这条帖子当前不可互动。",
  BUDDY_POST_SELF_LIKE_NOT_ALLOWED: "不能点赞自己的帖子。",
  BUDDY_POST_SELF_REPOST_NOT_ALLOWED: "不能转帖自己的帖子。",
  BUDDY_POST_REPOST_ALREADY_EXISTS: "你已经转帖过这条帖子。",
  BUDDY_POST_REPOST_SOURCE_UNAVAILABLE: "原帖当前不可转帖。",
  SOCIAL_FOLLOW_SELF_NOT_ALLOWED: "不能关注自己。",
  SOCIAL_PROFILE_NOT_FOUND: "用户不存在或暂不可访问。",
  UNKNOWN: "操作失败，请稍后再试。"
};

export default async function BuddyCirclePage({
  searchParams
}: {
  searchParams?: Promise<{
    error?: string;
    majorId?: string;
    province?: string;
    q?: string;
    sort?: string;
    studySystem?: string;
    tab?: string;
  }>;
}) {
  const user = await requireUser();
  if (user.role !== "student") {
    redirect("/admin");
  }

  const params = await searchParams;
  const scope = getScope(params?.tab);
  const sort = getSort(params?.sort);
  const query = params?.q?.trim() || "";
  const [regions, majors, feed, searchResult] = await Promise.all([
    prisma.region.findMany({
      where: { status: "active" },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
    }),
    prisma.major.findMany({
      where: { status: "published" },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
    }),
    listBuddyFeed(user.id, {
      majorId: params?.majorId || undefined,
      province: params?.province || undefined,
      scope,
      sort,
      studySystem: params?.studySystem || undefined,
      limit: 30
    }),
    query ? searchUsersByNickname(user.id, query) : Promise.resolve({ items: [] })
  ]);
  const returnTo = buildReturnTo(params);

  return (
    <main className="min-h-dvh bg-mist/60 lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      <StudentSidebar active="buddy-circle" />

      <section className="min-w-0 px-5 py-8 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-5">
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
              <div className="grid border-b border-slate-100 md:grid-cols-2">
                <FeedTab active={scope === "discover"} href="/buddy-circle?tab=discover" label="发现" />
                <FeedTab active={scope === "following"} href="/buddy-circle?tab=following" label="关注" />
              </div>

              <div className="p-5">
                {params?.error ? (
                  <p className="mb-4 rounded-xl bg-coral/10 px-4 py-3 text-sm font-bold text-coral">
                    {errorText[params.error] || errorText.UNKNOWN}
                  </p>
                ) : null}

                <form action={publishPost} className="space-y-4">
                  <input name="returnTo" type="hidden" value={returnTo} />
                  <label className="flex gap-3">
                    <ProfileAvatar user={{ avatarImage: "", nickname: user.username }} />
                    <textarea
                      className="input min-h-28 resize-y border-0 bg-slate-50 text-base leading-7 shadow-none"
                      name="content"
                      placeholder="有什么新鲜事？"
                    />
                  </label>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs font-semibold text-slate-400">仅支持文字、换行和表情。</p>
                    <button className="primary-button" type="submit">
                      <Send size={18} />
                      发帖
                    </button>
                  </div>
                </form>
              </div>
            </section>

            {scope === "discover" ? (
              <DiscoverFilters
                majors={majors}
                params={params}
                regions={regions}
                sort={sort}
              />
            ) : null}

            {query ? (
              <UserSearchResults query={query} returnTo={returnTo} users={searchResult.items} />
            ) : null}

            <section className="space-y-4">
              {feed.items.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm font-semibold text-slate-500">
                  {scope === "following" ? "你关注的人还没有发帖。" : "暂时没有符合条件的帖子。"}
                </div>
              ) : (
                feed.items.map((post) => <BuddyPostCard key={post.id} post={post} returnTo={returnTo} />)
              )}
            </section>
          </div>

          <aside className="space-y-5 xl:sticky xl:top-6 xl:self-start">
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
              <form className="relative" method="get">
                <input name="tab" type="hidden" value={scope} />
                <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  className="input min-h-12 rounded-full pl-11"
                  name="q"
                  defaultValue={query}
                  placeholder="搜索昵称"
                />
              </form>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
              <div className="flex items-center gap-2">
                <UsersRound className="text-teal" size={20} />
                <h2 className="text-lg font-black text-ink">搭子圈</h2>
              </div>
              <p className="mt-3 text-sm font-semibold leading-7 text-slate-500">
                “发现”展示所有公开帖子；“关注”只展示你已关注用户的帖子。搜索框仅按昵称找人。
              </p>
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}

function FeedTab({ active, href, label }: { active: boolean; href: string; label: string }) {
  return (
    <a
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative grid min-h-16 place-items-center text-sm font-black transition",
        active ? "bg-slate-50 text-ink" : "text-slate-500 hover:bg-slate-50 hover:text-ink"
      )}
      href={href}
    >
      {label}
      {active ? <span className="absolute bottom-0 h-1 w-16 rounded-full bg-sky-500" /> : null}
    </a>
  );
}

function DiscoverFilters({
  majors,
  params,
  regions,
  sort
}: {
  majors: Array<{ id: string; name: string }>;
  params?: { majorId?: string; province?: string; studySystem?: string };
  regions: Array<{ province: string; studySystem: string }>;
  sort: BuddyFeedSort;
}) {
  const provinces = Array.from(new Set(regions.map((region) => region.province))).filter(Boolean);
  const studySystems = Array.from(new Set(regions.map((region) => region.studySystem))).filter(Boolean);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
      <div className="mb-3 flex items-center gap-2 text-sm font-black text-ink">
        <SlidersHorizontal className="text-sky-500" size={18} />
        发现筛选
      </div>
      <form className="grid gap-3 md:grid-cols-5" method="get">
        <input name="tab" type="hidden" value="discover" />
        <select className="input" name="sort" defaultValue={sort}>
          <option value="latest">最新</option>
          <option value="hot">最热</option>
        </select>
        <select className="input" name="province" defaultValue={params?.province || ""}>
          <option value="">全部省份</option>
          {provinces.map((province) => <option key={province} value={province}>{province}</option>)}
        </select>
        <select className="input" name="studySystem" defaultValue={params?.studySystem || ""}>
          <option value="">全部学制</option>
          {studySystems.map((studySystem) => <option key={studySystem} value={studySystem}>{studySystem}</option>)}
        </select>
        <select className="input" name="majorId" defaultValue={params?.majorId || ""}>
          <option value="">全部专业</option>
          {majors.map((major) => <option key={major.id} value={major.id}>{major.name}</option>)}
        </select>
        <button className="primary-button" type="submit">筛选</button>
      </form>
    </section>
  );
}

function UserSearchResults({
  query,
  returnTo,
  users
}: {
  query: string;
  returnTo: string;
  users: SocialUserSearchResult[];
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
      <h2 className="text-base font-black text-ink">昵称搜索：{query}</h2>
      <div className="mt-4 space-y-3">
        {users.length === 0 ? (
          <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm font-semibold text-slate-500">没有找到匹配昵称的用户。</p>
        ) : (
          users.map((user) => (
            <div key={user.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 p-4">
              <a className="flex min-w-0 items-center gap-3" href={`/students/${user.id}`}>
                <ProfileAvatar user={user} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-black text-ink">{user.nickname}</span>
                  <span className="mt-1 block truncate text-xs font-semibold text-slate-500">
                    {[user.province, user.majorName].filter(Boolean).join(" · ") || user.bio || "暂未填写简介"}
                  </span>
                </span>
              </a>
              <form action={user.isFollowing ? unfollowFromCircle : followFromCircle}>
                <input name="targetId" type="hidden" value={user.id} />
                <input name="returnTo" type="hidden" value={returnTo} />
                <button className={user.isFollowing ? "secondary-button min-h-10 px-4 text-xs" : "primary-button min-h-10 px-4 text-xs"} type="submit">
                  {user.isFollowing ? <UserCheck size={16} /> : <UserPlus size={16} />}
                  {user.isFollowing ? "已关注" : "关注"}
                </button>
              </form>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function BuddyPostCard({ post, returnTo }: { post: BuddyFeedItem; returnTo: string }) {
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
              <p className="mt-0.5 text-xs font-semibold text-slate-400">
                {[post.author.province, post.author.majorName].filter(Boolean).join(" · ") || "公开帖子"} · {formatDateTime(post.createdAt)}
              </p>
            </div>
            {post.canDelete ? (
              <form action={deletePost}>
                <input name="postId" type="hidden" value={post.id} />
                <input name="returnTo" type="hidden" value={returnTo} />
                <button className="inline-flex min-h-9 items-center gap-1 rounded-full px-3 text-xs font-bold text-slate-400 hover:bg-coral/10 hover:text-coral" type="submit">
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
              <p className="text-xs font-bold text-slate-400">转帖了 {post.originalPost?.author.nickname || "对方"} 的帖子</p>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                {post.sourceState === "visible" && post.originalPost ? (
                  <>
                    <p className="text-sm font-black text-ink">{post.originalPost.author.nickname}</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-7 text-slate-600">{post.originalPost.content}</p>
                  </>
                ) : (
                  <p className="text-sm font-bold text-slate-400">原内容已删除</p>
                )}
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
            <form action={post.likedByMe ? unlikePost : likePost}>
              <input name="postId" type="hidden" value={post.id} />
              <input name="returnTo" type="hidden" value={returnTo} />
              <button
                className={cn(
                  "inline-flex min-h-9 items-center gap-1 rounded-full px-3 text-xs font-black transition",
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
                <input name="returnTo" type="hidden" value={returnTo} />
                <button
                  className="inline-flex min-h-9 items-center gap-1 rounded-full bg-slate-100 px-3 text-xs font-black text-slate-500 transition hover:bg-teal/10 hover:text-teal disabled:cursor-not-allowed disabled:opacity-50"
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

function ProfileAvatar({ user }: { user: { avatarColor?: string; avatarImage?: string; nickname: string } }) {
  if (user.avatarImage) {
    return <img alt={`${user.nickname} 的头像`} className="size-12 shrink-0 rounded-full object-cover shadow-sm" src={user.avatarImage} />;
  }
  return (
    <span className="grid size-12 shrink-0 place-items-center rounded-full bg-[#58cc02] text-lg font-black text-white shadow-sm">
      {user.nickname.slice(0, 1).toUpperCase()}
    </span>
  );
}

function getScope(tab?: string): BuddyFeedScope {
  return tab === "following" ? "following" : "discover";
}

function getSort(sort?: string): BuddyFeedSort {
  return sort === "hot" ? "hot" : "latest";
}

function buildReturnTo(params?: {
  majorId?: string;
  province?: string;
  q?: string;
  sort?: string;
  studySystem?: string;
  tab?: string;
}) {
  const query = new URLSearchParams();
  query.set("tab", getScope(params?.tab));
  if (params?.sort) query.set("sort", params.sort);
  if (params?.province) query.set("province", params.province);
  if (params?.studySystem) query.set("studySystem", params.studySystem);
  if (params?.majorId) query.set("majorId", params.majorId);
  if (params?.q) query.set("q", params.q);
  return `/buddy-circle?${query.toString()}`;
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
    redirectWithError(formData, error);
  }
  revalidatePath("/buddy-circle");
  redirect(getReturnTo(formData));
}

async function deletePost(formData: FormData) {
  "use server";
  const user = await requireUser();
  try {
    await deleteBuddyPost(user.id, String(formData.get("postId") || ""));
  } catch (error) {
    redirectWithError(formData, error);
  }
  revalidatePath("/buddy-circle");
  redirect(getReturnTo(formData));
}

async function likePost(formData: FormData) {
  "use server";
  const user = await requireUser();
  try {
    await likeBuddyPost(user.id, String(formData.get("postId") || ""));
  } catch (error) {
    redirectWithError(formData, error);
  }
  revalidatePath("/buddy-circle");
  redirect(getReturnTo(formData));
}

async function unlikePost(formData: FormData) {
  "use server";
  const user = await requireUser();
  try {
    await unlikeBuddyPost(user.id, String(formData.get("postId") || ""));
  } catch (error) {
    redirectWithError(formData, error);
  }
  revalidatePath("/buddy-circle");
  redirect(getReturnTo(formData));
}

async function repostPost(formData: FormData) {
  "use server";
  const user = await requireUser();
  try {
    await repostBuddyPost(user.id, String(formData.get("postId") || ""));
  } catch (error) {
    redirectWithError(formData, error);
  }
  revalidatePath("/buddy-circle");
  redirect(getReturnTo(formData));
}

async function followFromCircle(formData: FormData) {
  "use server";
  const user = await requireUser();
  try {
    await followUser(user.id, String(formData.get("targetId") || ""));
  } catch (error) {
    redirectWithError(formData, error);
  }
  revalidatePath("/buddy-circle");
  redirect(getReturnTo(formData));
}

async function unfollowFromCircle(formData: FormData) {
  "use server";
  const user = await requireUser();
  try {
    await unfollowUser(user.id, String(formData.get("targetId") || ""));
  } catch (error) {
    redirectWithError(formData, error);
  }
  revalidatePath("/buddy-circle");
  redirect(getReturnTo(formData));
}

function getReturnTo(formData: FormData) {
  const returnTo = String(formData.get("returnTo") || "/buddy-circle");
  return returnTo.startsWith("/buddy-circle") ? returnTo : "/buddy-circle";
}

function redirectWithError(formData: FormData, error: unknown): never {
  const buddyError = formatBuddyError(error);
  const returnTo = new URL(`http://local${getReturnTo(formData)}`);
  returnTo.searchParams.set("error", buddyError?.code || "UNKNOWN");
  redirect(`${returnTo.pathname}${returnTo.search}`);
}
