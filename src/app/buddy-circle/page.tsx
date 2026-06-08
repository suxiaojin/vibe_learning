import type { ReactNode } from "react";
import { Ban, Check, ChevronDown, Heart, MoreHorizontal, Repeat2, Search, Send, SlidersHorizontal, Trash2, UserCheck, UserMinus, UserPlus, X } from "lucide-react";
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
  unrepostBuddyPost,
  type BuddyFeedScope,
  type BuddyFeedSort
} from "@/lib/buddy-posts";
import { formatBuddyError } from "@/lib/buddies";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { blockUser, followUser, listRecommendedFollows, searchUsersByNickname, unfollowUser, type SocialRecommendation, type SocialUserSearchResult } from "@/lib/social";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type BuddyFeedItem = Awaited<ReturnType<typeof listBuddyFeed>>["items"][number];
type CircleSearchParams = {
  error?: string;
  majorId?: string;
  province?: string;
  q?: string;
  sort?: string;
  studySystem?: string;
  tab?: string;
};

const errorText: Record<string, string> = {
  BUDDY_POST_EMPTY: "动态内容不能为空。",
  BUDDY_POST_LINK_NOT_ALLOWED: "发帖内容不能包含超链接。",
  BUDDY_POST_NOT_VISIBLE: "这条帖子当前不可互动。",
  BUDDY_POST_REPOST_ALREADY_EXISTS: "你已经转帖过这条帖子。",
  BUDDY_POST_REPOST_NOT_FOUND: "转帖不存在或已取消。",
  BUDDY_POST_REPOST_SOURCE_UNAVAILABLE: "原帖当前不可转帖。",
  SOCIAL_BLOCK_SELF_NOT_ALLOWED: "不能屏蔽自己。",
  SOCIAL_FOLLOW_SELF_NOT_ALLOWED: "不能关注自己。",
  SOCIAL_PROFILE_NOT_FOUND: "用户不存在或暂不可访问。",
  UNKNOWN: "操作失败，请稍后再试。"
};

const avatarColorClasses: Record<string, string> = {
  coral: "bg-coral",
  green: "bg-[#58cc02]",
  honey: "bg-honey",
  sky: "bg-sky-500",
  violet: "bg-violet-500"
};

export default async function BuddyCirclePage({
  searchParams
}: {
  searchParams?: Promise<CircleSearchParams>;
}) {
  const user = await requireUser();
  if (user.role !== "student") {
    redirect("/admin");
  }

  const params = await searchParams;
  const scope = getScope(params?.tab);
  const sort = getSort(params?.sort);
  const query = params?.q?.trim() || "";
  const [regions, majors, feed, searchResult, recommendedFollows] = await Promise.all([
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
    query ? searchUsersByNickname(user.id, query) : Promise.resolve({ items: [] }),
    listRecommendedFollows(user.id, { limit: 5 })
  ]);
  const returnTo = buildCircleHref(params);

  return (
    <main className="min-h-dvh bg-mist/60 lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      <StudentSidebar active="buddy-circle" />

      <section className="min-w-0 px-5 py-8 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-5">
            <FeedHeader params={params} scope={scope} sort={sort} />

            {params?.error ? (
              <p className="rounded-xl bg-coral/10 px-4 py-3 text-sm font-bold text-coral">
                {errorText[params.error] || errorText.UNKNOWN}
              </p>
            ) : null}

            <PostComposer returnTo={returnTo} />

            {query ? <UserSearchResults query={query} returnTo={returnTo} users={searchResult.items} /> : null}

            <section className="space-y-4">
              {feed.items.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm font-semibold text-slate-500">
                  {scope === "following" ? "你关注的人还没有发帖。" : "暂时没有符合条件的帖子。"}
                </div>
              ) : (
                feed.items.map((post) => (
                  <BuddyPostCard key={post.id} post={post} returnTo={returnTo} scope={scope} />
                ))
              )}
            </section>
          </div>

          <aside className="space-y-5 xl:sticky xl:top-6 xl:self-start">
            <SearchPanel params={params} query={query} scope={scope} sort={sort} />
            <FeedFilters majors={majors} params={params} regions={regions} scope={scope} sort={sort} />
            <RecommendedFollowPanel returnTo={returnTo} users={recommendedFollows.items} />
          </aside>
        </div>
      </section>
    </main>
  );
}

function FeedHeader({
  params,
  scope,
  sort
}: {
  params?: CircleSearchParams;
  scope: BuddyFeedScope;
  sort: BuddyFeedSort;
}) {
  return (
    <section className="sticky top-0 z-30 overflow-visible rounded-2xl border border-slate-200 bg-white/95 shadow-sm backdrop-blur">
      <div className="grid min-h-16 grid-cols-2">
        <FeedTab active={scope === "discover"} label="发现" params={params} sort={sort} tab="discover" />
        <FeedTab active={scope === "following"} label="关注" params={params} sort={sort} tab="following" />
      </div>
    </section>
  );
}

function FeedTab({
  active,
  label,
  params,
  sort,
  tab
}: {
  active: boolean;
  label: string;
  params?: CircleSearchParams;
  sort: BuddyFeedSort;
  tab: BuddyFeedScope;
}) {
  const options: Array<{ key: BuddyFeedSort; label: string }> = [
    { key: "hot", label: "热门" },
    { key: "latest", label: "最新" }
  ];

  return (
    <div
      className={cn(
        "group relative grid min-h-16 place-items-center border-b-2 text-sm font-black transition",
        active ? "border-sky-500 text-ink" : "border-transparent text-slate-500 hover:bg-slate-50 hover:text-ink"
      )}
    >
      <a
        aria-current={active ? "page" : undefined}
        className="inline-flex min-h-12 items-center justify-center gap-1 px-8 outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
        href={`/buddy-circle?tab=${tab}`}
      >
        {label}
        <ChevronDown className="transition group-hover:rotate-180 group-focus-within:rotate-180" size={16} />
      </a>
      <div className="invisible absolute top-full z-40 w-36 overflow-hidden rounded-xl border border-slate-200 bg-white py-2 opacity-0 shadow-[0_12px_32px_rgba(15,23,42,0.18)] transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
        {options.map((option) => (
          <a
            key={option.key}
            className="flex items-center justify-between px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-50"
            href={buildCircleHref(params, { sort: option.key, tab })}
          >
            {option.label}
            {active && sort === option.key ? <Check className="text-sky-500" size={17} /> : null}
          </a>
        ))}
      </div>
    </div>
  );
}

function PostComposer({ returnTo }: { returnTo: string }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
      <form action={publishPost} className="space-y-4">
        <input name="returnTo" type="hidden" value={returnTo} />
        <textarea
          className="input min-h-28 resize-y border-0 bg-slate-50 text-base leading-7 shadow-none"
          name="content"
          placeholder="有什么新鲜事？"
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold text-slate-400">仅支持文字和表情，不能包含超链接、图片、视频或音频。</p>
          <button className="primary-button" type="submit">
            <Send size={18} />
            发帖
          </button>
        </div>
      </form>
    </section>
  );
}

function SearchPanel({
  params,
  query,
  scope,
  sort
}: {
  params?: CircleSearchParams;
  query: string;
  scope: BuddyFeedScope;
  sort: BuddyFeedSort;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
      <form className="relative" method="get">
        <input name="tab" type="hidden" value={scope} />
        <input name="sort" type="hidden" value={sort} />
        {params?.province ? <input name="province" type="hidden" value={params.province} /> : null}
        {params?.studySystem ? <input name="studySystem" type="hidden" value={params.studySystem} /> : null}
        {params?.majorId ? <input name="majorId" type="hidden" value={params.majorId} /> : null}
        <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <input
          className="input min-h-12 rounded-full pl-11"
          name="q"
          defaultValue={query}
          placeholder="搜索昵称"
        />
      </form>
    </section>
  );
}

function FeedFilters({
  majors,
  params,
  regions,
  scope,
  sort
}: {
  majors: Array<{ id: string; name: string }>;
  params?: CircleSearchParams;
  regions: Array<{ province: string; studySystem: string }>;
  scope: BuddyFeedScope;
  sort: BuddyFeedSort;
}) {
  const provinces = Array.from(new Set(regions.map((region) => region.province))).filter(Boolean);
  const studySystems = Array.from(new Set(regions.map((region) => region.studySystem))).filter(Boolean);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
      <div className="mb-4 flex items-center gap-2 text-lg font-black text-ink">
        <SlidersHorizontal className="text-sky-500" size={20} />
        筛选条件
      </div>
      <form className="space-y-3" method="get">
        <input name="tab" type="hidden" value={scope} />
        <input name="sort" type="hidden" value={sort} />
        {params?.q ? <input name="q" type="hidden" value={params.q} /> : null}
        <label className="block">
          <span className="label">省份</span>
          <select className="input" name="province" defaultValue={params?.province || ""}>
            <option value="">全部省份</option>
            {provinces.map((province) => <option key={province} value={province}>{province}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="label">学制</span>
          <select className="input" name="studySystem" defaultValue={params?.studySystem || ""}>
            <option value="">全部学制</option>
            {studySystems.map((studySystem) => <option key={studySystem} value={studySystem}>{studySystem}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="label">专业</span>
          <select className="input" name="majorId" defaultValue={params?.majorId || ""}>
            <option value="">全部专业</option>
            {majors.map((major) => <option key={major.id} value={major.id}>{major.name}</option>)}
          </select>
        </label>
        <div className="flex gap-2 pt-1">
          <button className="primary-button flex-1" type="submit">筛选</button>
          <a className="secondary-button min-h-11 px-4" href={`/buddy-circle?tab=${scope}`}>重置</a>
        </div>
      </form>
    </section>
  );
}

function RecommendedFollowPanel({ returnTo, users }: { returnTo: string; users: SocialRecommendation[] }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
      <h2 className="text-lg font-black text-ink">推荐关注</h2>
      <div className="mt-4 space-y-4">
        {users.length === 0 ? (
          <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm font-semibold text-slate-500">暂时没有同条件推荐。</p>
        ) : (
          users.map((user) => (
            <div key={user.id} className="flex items-center justify-between gap-3">
              <a className="flex min-w-0 items-center gap-3" href={`/students/${user.id}`}>
                <ProfileAvatar user={user} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-black text-ink">{user.nickname}</span>
                  <span className="block truncate text-xs font-semibold text-slate-500">@{user.username}</span>
                </span>
              </a>
              <form action={followFromCircle}>
                <input name="targetId" type="hidden" value={user.id} />
                <input name="returnTo" type="hidden" value={returnTo} />
                <button className="min-h-10 rounded-full bg-ink px-5 text-sm font-black text-white transition hover:bg-slate-700" type="submit">
                  关注
                </button>
              </form>
            </div>
          ))
        )}
      </div>
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
                    {[user.province, user.studySystem, user.majorName].filter(Boolean).join(" · ") || user.bio || "暂未填写简介"}
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

function BuddyPostCard({ post, returnTo, scope }: { post: BuddyFeedItem; returnTo: string; scope: BuddyFeedScope }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
      <div className="flex items-start gap-3">
        <a href={`/students/${post.author.id}`}>
          <ProfileAvatar user={post.author} />
        </a>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <a className="font-black text-ink hover:text-teal" href={`/students/${post.author.id}`}>
                {post.author.nickname}
              </a>
              <p className="mt-0.5 text-xs font-semibold text-slate-400">
                {[post.author.province, post.author.studySystem, post.author.majorName].filter(Boolean).join(" · ") || "公开帖子"} · {formatDateTime(post.createdAt)}
              </p>
            </div>
            <PostMoreMenu post={post} returnTo={returnTo} scope={scope} />
          </div>

          {post.type === "original" ? (
            <p className="mt-4 whitespace-pre-wrap text-sm font-semibold leading-7 text-slate-700">{post.content}</p>
          ) : (
            <div className="mt-4 space-y-3">
              {post.content ? <p className="whitespace-pre-wrap text-sm font-semibold leading-7 text-slate-700">{post.content}</p> : null}
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

          <div className="mt-4 flex flex-wrap items-center gap-8 border-t border-slate-100 pt-4">
            <LikeAction post={post} returnTo={returnTo} />
            {post.type === "original" ? <RepostAction post={post} returnTo={returnTo} /> : null}
          </div>
        </div>
      </div>
    </article>
  );
}

function PostMoreMenu({ post, returnTo, scope }: { post: BuddyFeedItem; returnTo: string; scope: BuddyFeedScope }) {
  const showAuthorActions = !post.canDelete;
  const hasActions = post.canDelete || showAuthorActions;
  if (!hasActions) {
    return null;
  }

  return (
    <details className="group relative shrink-0">
      <summary
        aria-label="更多操作"
        className="grid size-9 cursor-pointer list-none place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-ink [&::-webkit-details-marker]:hidden"
      >
        <MoreHorizontal size={20} />
      </summary>
      <div className="absolute right-0 top-11 z-40 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white py-2 shadow-[0_12px_32px_rgba(15,23,42,0.18)]">
        {scope === "discover" && showAuthorActions ? (
          <>
            <form action={followFromCircle}>
              <input name="targetId" type="hidden" value={post.author.id} />
              <input name="returnTo" type="hidden" value={returnTo} />
              <MenuButton icon={<UserPlus size={18} />} label={`关注 @${post.author.username}`} />
            </form>
            <form action={blockFromCircle}>
              <input name="targetId" type="hidden" value={post.author.id} />
              <input name="returnTo" type="hidden" value={returnTo} />
              <MenuButton icon={<Ban size={18} />} label={`屏蔽 @${post.author.username}`} />
            </form>
          </>
        ) : null}

        {scope === "following" && showAuthorActions ? (
          <form action={unfollowFromCircle}>
            <input name="targetId" type="hidden" value={post.author.id} />
            <input name="returnTo" type="hidden" value={returnTo} />
            <MenuButton icon={<UserMinus size={18} />} label={`取消关注 @${post.author.username}`} />
          </form>
        ) : null}

        {post.canDelete ? (
          <form action={deletePost}>
            <input name="postId" type="hidden" value={post.id} />
            <input name="returnTo" type="hidden" value={returnTo} />
            <MenuButton danger icon={<Trash2 size={18} />} label="删除帖子" />
          </form>
        ) : null}
      </div>
    </details>
  );
}

function MenuButton({ danger = false, icon, label }: { danger?: boolean; icon: ReactNode; label: string }) {
  return (
    <button
      className={cn(
        "flex min-h-11 w-full items-center gap-3 px-4 text-left text-sm font-black transition hover:bg-slate-50",
        danger ? "text-coral" : "text-slate-700"
      )}
      type="submit"
    >
      {icon}
      {label}
    </button>
  );
}

function LikeAction({ post, returnTo }: { post: BuddyFeedItem; returnTo: string }) {
  return (
    <form action={post.likedByMe ? unlikePost : likePost}>
      <input name="postId" type="hidden" value={post.id} />
      <input name="returnTo" type="hidden" value={returnTo} />
      <button
        aria-label={post.likedByMe ? "取消点赞" : "点赞"}
        className={cn(
          "inline-flex min-h-9 min-w-16 items-center gap-2 rounded-full px-2 text-sm font-black transition",
          post.likedByMe ? "text-pink-500" : "text-slate-400 hover:text-pink-500"
        )}
        disabled={!post.canLike && !post.likedByMe}
        type="submit"
      >
        <Heart className={post.likedByMe ? "fill-current" : ""} size={18} />
        <span>{post.likeCount}</span>
      </button>
    </form>
  );
}

function RepostAction({ post, returnTo }: { post: BuddyFeedItem; returnTo: string }) {
  if (post.repostedByMe) {
    return (
      <form action={unrepostPost}>
        <input name="postId" type="hidden" value={post.id} />
        <input name="returnTo" type="hidden" value={returnTo} />
        <button
          aria-label="取消转帖"
          className="inline-flex min-h-9 min-w-16 items-center gap-2 rounded-full px-2 text-sm font-black text-teal transition hover:text-slate-400"
          type="submit"
        >
          <Repeat2 size={18} />
          <span>{post.repostCount}</span>
        </button>
      </form>
    );
  }

  const modalId = `repost-${post.id}`;
  return (
    <div className="relative">
      <input className="peer sr-only" id={modalId} type="checkbox" />
      <label
        aria-label="转帖"
        className={cn(
          "inline-flex min-h-9 min-w-16 cursor-pointer items-center gap-2 rounded-full px-2 text-sm font-black text-slate-400 transition hover:text-teal",
          !post.canRepost && "pointer-events-none cursor-not-allowed opacity-50"
        )}
        htmlFor={modalId}
      >
        <Repeat2 size={18} />
        <span>{post.repostCount}</span>
      </label>
      <div className="fixed inset-0 z-50 hidden place-items-start justify-center overflow-y-auto bg-ink/35 px-4 py-12 peer-checked:grid">
        <form action={repostPost} className="relative w-full max-w-2xl rounded-2xl bg-white p-5 shadow-[0_18px_60px_rgba(15,23,42,0.24)]">
          <input name="postId" type="hidden" value={post.id} />
          <input name="returnTo" type="hidden" value={returnTo} />
          <div className="flex items-center justify-between gap-3">
            <label className="grid size-9 cursor-pointer place-items-center rounded-full text-ink hover:bg-slate-100" htmlFor={modalId}>
              <X size={22} />
            </label>
            <button className="min-h-10 rounded-full bg-ink px-6 text-sm font-black text-white transition hover:bg-slate-700" type="submit">
              发帖
            </button>
          </div>
          <textarea
            className="mt-5 min-h-24 w-full resize-y border-0 text-xl font-semibold leading-8 text-ink outline-none placeholder:text-slate-400"
            maxLength={300}
            name="content"
            placeholder="添加评论"
          />
          <div className="mt-4 rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 text-sm">
              <ProfileAvatar user={post.author} />
              <div className="min-w-0">
                <p className="truncate font-black text-ink">{post.author.nickname}</p>
                <p className="truncate text-xs font-semibold text-slate-400">@{post.author.username} · {formatDateTime(post.createdAt)}</p>
              </div>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm font-semibold leading-7 text-slate-700">{post.content}</p>
          </div>
        </form>
      </div>
    </div>
  );
}

function ProfileAvatar({ user }: { user: { avatarColor?: string; avatarImage?: string; nickname: string } }) {
  if (user.avatarImage) {
    return <img alt={`${user.nickname} 的头像`} className="size-12 shrink-0 rounded-full object-cover shadow-sm" src={user.avatarImage} />;
  }
  return (
    <span className={cn("grid size-12 shrink-0 place-items-center rounded-full text-lg font-black text-white shadow-sm", avatarColorClasses[user.avatarColor || "green"] || avatarColorClasses.green)}>
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

function buildCircleHref(params?: CircleSearchParams, overrides?: { sort?: BuddyFeedSort; tab?: BuddyFeedScope }) {
  const query = new URLSearchParams();
  query.set("tab", overrides?.tab || getScope(params?.tab));
  const sort = overrides?.sort || getSort(params?.sort);
  if (sort === "hot") query.set("sort", sort);
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
  revalidatePath("/me");
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
  revalidatePath("/me");
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
  revalidatePath("/me");
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
  revalidatePath("/me");
  redirect(getReturnTo(formData));
}

async function repostPost(formData: FormData) {
  "use server";
  const user = await requireUser();
  try {
    await repostBuddyPost(user.id, String(formData.get("postId") || ""), String(formData.get("content") || ""));
  } catch (error) {
    redirectWithError(formData, error);
  }
  revalidatePath("/buddy-circle");
  revalidatePath("/me");
  redirect(getReturnTo(formData));
}

async function unrepostPost(formData: FormData) {
  "use server";
  const user = await requireUser();
  try {
    await unrepostBuddyPost(user.id, String(formData.get("postId") || ""));
  } catch (error) {
    redirectWithError(formData, error);
  }
  revalidatePath("/buddy-circle");
  revalidatePath("/me");
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

async function blockFromCircle(formData: FormData) {
  "use server";
  const user = await requireUser();
  try {
    await blockUser(user.id, String(formData.get("targetId") || ""));
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
