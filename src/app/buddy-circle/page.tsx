import type { ReactNode } from "react";
import { Ban, Check, ChevronDown, MoreHorizontal, SlidersHorizontal, Trash2, UserMinus, UserPlus } from "lucide-react";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { BuddyFeedLoadMore } from "@/components/buddy-feed-load-more";
import { BuddyPostComposer } from "@/components/buddy-post-composer";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { DismissibleDetails } from "@/components/dismissible-details";
import { FollowingFeedReadMarker } from "@/components/following-feed-read-marker";
import { PostSuccessNoticeTrigger } from "@/components/post-success-toast";
import { SocialAvatar, SocialPostCard, type SocialPostNode } from "@/components/social-post-card";
import { SocialPostActions } from "@/components/social-post-actions";
import { StudentPageShell } from "@/components/student-page-shell";
import { EmptyState, SurfaceCard } from "@/components/student-ui";
import {
  createBuddyPost,
  deleteBuddyPost,
  getFollowingFeedUnreadCount,
  likeBuddyPost,
  listBuddyFeed,
  markFollowingFeedRead,
  repostBuddyPost,
  unlikeBuddyPost,
  unrepostBuddyPost,
  type BuddyFeedScope,
  type BuddyFeedSort
} from "@/lib/buddy-posts";
import { formatBuddyError } from "@/lib/buddies";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { blockUser, followUser, listRecommendedFollows, unfollowUser, type SocialRecommendation } from "@/lib/social";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type BuddyFeedItem = Awaited<ReturnType<typeof listBuddyFeed>>["items"][number];
type CircleSearchParams = {
  error?: string;
  majorId?: string;
  notice?: string;
  province?: string;
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
  const followingReadThroughAt = new Date();
  const [regions, majors, feed, recommendedFollows, followingUnreadCount] = await Promise.all([
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
      limit: 20
    }),
    listRecommendedFollows(user.id, { limit: 5 }),
    scope === "following" ? Promise.resolve(0) : getFollowingFeedUnreadCount(user.id)
  ]);
  const returnTo = buildCircleHref(params);

  return (
    <StudentPageShell active="buddy-circle" maxWidthClassName="max-w-[1520px]">
      <PostSuccessNoticeTrigger active={params?.notice === "post-sent"} />
      {scope === "following" ? (
        <FollowingFeedReadMarker action={markFollowingFeedAsRead} readThroughAt={followingReadThroughAt.toISOString()} />
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(680px,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <FeedHeader followingUnreadCount={followingUnreadCount} params={params} scope={scope} sort={sort} />

          {params?.error ? (
            <p className="rounded-2xl bg-coral/10 px-4 py-3 text-sm font-semibold text-coral">
              {errorText[params.error] || errorText.UNKNOWN}
            </p>
          ) : null}

          <PostComposer returnTo={returnTo} />

          <section className="space-y-4">
            {feed.items.length === 0 ? (
              <EmptyState
                title={scope === "following" ? "关注动态为空" : "暂时没有帖子"}
                description={scope === "following" ? "你关注的人还没有发帖，可以先去发现页看看新的学习搭子。" : "暂时没有符合条件的帖子，换个筛选条件试试看。"}
              />
            ) : (
              feed.items.map((post) => (
                <BuddyPostCard key={post.id} post={post} returnTo={returnTo} scope={scope} />
              ))
            )}
            <BuddyFeedLoadMore
              initialNextCursor={feed.nextCursor}
              majorId={params?.majorId || undefined}
              province={params?.province || undefined}
              scope={scope}
              sort={sort}
              studySystem={params?.studySystem || undefined}
            />
          </section>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <FeedFilters majors={majors} params={params} regions={regions} scope={scope} sort={sort} />
          <RecommendedFollowPanel returnTo={returnTo} users={recommendedFollows.items} />
        </aside>
      </div>
    </StudentPageShell>
  );
}

function FeedHeader({
  followingUnreadCount,
  params,
  scope,
  sort
}: {
  followingUnreadCount: number;
  params?: CircleSearchParams;
  scope: BuddyFeedScope;
  sort: BuddyFeedSort;
}) {
  return (
    <section className="surface-card sticky top-0 z-30 overflow-visible bg-surface/95 p-0 backdrop-blur">
      <div className="grid min-h-[64px] grid-cols-2">
        <FeedTab active={scope === "discover"} label="发现" params={params} sort={sort} tab="discover" unreadCount={0} />
        <FeedTab active={scope === "following"} label="关注" params={params} sort={sort} tab="following" unreadCount={followingUnreadCount} />
      </div>
    </section>
  );
}

function FeedTab({
  active,
  label,
  params,
  sort,
  tab,
  unreadCount
}: {
  active: boolean;
  label: string;
  params?: CircleSearchParams;
  sort: BuddyFeedSort;
  tab: BuddyFeedScope;
  unreadCount: number;
}) {
  const options: Array<{ key: BuddyFeedSort; label: string }> = [
    { key: "hot", label: "热门" },
    { key: "latest", label: "最新" }
  ];

  return (
    <div
      className={cn(
        "group relative grid min-h-[64px] place-items-center border-b-2 text-base font-semibold transition",
        active ? "border-teal text-ink" : "border-transparent text-slate-500 hover:bg-slate-50/80 hover:text-ink"
      )}
    >
      <a
        aria-current={active ? "page" : undefined}
        className="inline-flex min-h-12 items-center justify-center gap-1 px-8 outline-none focus-visible:ring-2 focus-visible:ring-teal/30"
        href={`/buddy-circle?tab=${tab}`}
      >
        <span className={cn("relative inline-flex items-center", unreadCount > 0 && "mr-4")}>
          {label}
          {unreadCount > 0 ? (
            <span
              aria-label={`${unreadCount > 10 ? "10条以上" : unreadCount}未读帖子`}
              className="absolute -right-5 -top-3 flex h-5 min-w-5 items-center justify-center rounded-full bg-coral px-1 text-[11px] font-bold leading-none text-white shadow-sm"
            >
              {unreadCount > 10 ? "10+" : unreadCount}
            </span>
          ) : null}
        </span>
        <ChevronDown className="transition group-hover:rotate-180 group-focus-within:rotate-180" size={16} />
      </a>
      <div className="invisible absolute top-full z-40 w-36 overflow-hidden rounded-2xl border border-border-soft bg-white py-2 opacity-0 shadow-popover transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
        {options.map((option) => (
          <a
            key={option.key}
            className="flex items-center justify-between px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            href={buildCircleHref(params, { sort: option.key, tab })}
          >
            {option.label}
            {active && sort === option.key ? <Check className="text-teal" size={17} /> : null}
          </a>
        ))}
      </div>
    </div>
  );
}

function PostComposer({ returnTo }: { returnTo: string }) {
  return (
    <SurfaceCard>
      <BuddyPostComposer action={publishPost} returnTo={returnTo} />
    </SurfaceCard>
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
    <SurfaceCard className="border-border-soft/70 bg-surface/80 p-4 shadow-none">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-ink">
        <SlidersHorizontal className="text-slate-400" size={18} />
        筛选条件
      </div>
      <form className="space-y-3" method="get">
        <input name="tab" type="hidden" value={scope} />
        <input name="sort" type="hidden" value={sort} />
        <label className="block">
          <span className="label">省份</span>
          <select className="input min-h-11 rounded-xl text-sm" name="province" defaultValue={params?.province || ""}>
            <option value="">全部省份</option>
            {provinces.map((province) => <option key={province} value={province}>{province}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="label">学制</span>
          <select className="input min-h-11 rounded-xl text-sm" name="studySystem" defaultValue={params?.studySystem || ""}>
            <option value="">全部学制</option>
            {studySystems.map((studySystem) => <option key={studySystem} value={studySystem}>{studySystem}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="label">专业</span>
          <select className="input min-h-11 rounded-xl text-sm" name="majorId" defaultValue={params?.majorId || ""}>
            <option value="">全部专业</option>
            {majors.map((major) => <option key={major.id} value={major.id}>{major.name}</option>)}
          </select>
        </label>
        <div className="flex gap-2 pt-1">
          <button className="primary-button min-h-11 flex-1 rounded-xl text-sm" type="submit">筛选</button>
          <a className="secondary-button min-h-11 rounded-xl px-4 text-sm" href={`/buddy-circle?tab=${scope}`}>重置</a>
        </div>
      </form>
    </SurfaceCard>
  );
}

function RecommendedFollowPanel({ returnTo, users }: { returnTo: string; users: SocialRecommendation[] }) {
  return (
    <SurfaceCard className="border-border-soft/70 bg-surface/80 p-4 shadow-none">
      <h2 className="text-sm font-semibold text-ink">推荐关注</h2>
      <div className="mt-3 space-y-3">
        {users.length === 0 ? (
          <p className="rounded-xl bg-surface-muted px-4 py-6 text-center text-sm font-medium text-slate-500">暂时没有同条件推荐。</p>
        ) : (
          users.map((user) => (
            <div key={user.id} className="flex items-center justify-between gap-3 rounded-xl px-1 py-1">
              <a className="flex min-w-0 items-center gap-3" href={`/students/${user.id}`}>
                <SocialAvatar size="sm" user={user} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-ink">{user.nickname}</span>
                  <span className="block truncate text-xs font-medium text-slate-500">@{user.username}</span>
                </span>
              </a>
              <form action={followFromCircle}>
                <input name="targetId" type="hidden" value={user.id} />
                <input name="returnTo" type="hidden" value={returnTo} />
                <button className="secondary-button min-h-9 rounded-full px-4 text-sm" type="submit">
                  关注
                </button>
              </form>
            </div>
          ))
        )}
      </div>
    </SurfaceCard>
  );
}

function BuddyPostCard({ post, returnTo, scope }: { post: BuddyFeedItem; returnTo: string; scope: BuddyFeedScope }) {
  return (
    <SocialPostCard
      actionMenu={<PostMoreMenu post={post} returnTo={returnTo} scope={scope} />}
      getDateLabel={formatDateTime}
      post={post as SocialPostNode}
      renderActions={(targetPost) => <BuddyPostActions post={targetPost} />}
    />
  );
}

function BuddyPostActions({ post }: { post: SocialPostNode }) {
  return (
    <SocialPostActions
      canLike={post.canLike}
      canRepost={post.canRepost}
      initialLikeCount={post.likeCount}
      initialLiked={post.likedByMe}
      initialRepostCount={post.repostCount}
      initialReposted={post.repostedByMe}
      postId={post.id}
      repostSource={getPostRepostSource(post)}
    />
  );
}

function getPostRepostSource(post: {
  author: { nickname: string; username: string };
  canRepost: boolean;
  content: string;
  createdAt: Date | string;
  originalPost?: { content: string } | null;
}) {
  return post.canRepost
    ? {
        authorName: post.author.nickname,
        content: post.content || post.originalPost?.content || "",
        createdAtLabel: formatDateTime(post.createdAt),
        username: post.author.username
      }
    : undefined;
}

function PostMoreMenu({ post, returnTo, scope }: { post: BuddyFeedItem; returnTo: string; scope: BuddyFeedScope }) {
  const showAuthorActions = !post.canDelete;
  const hasActions = post.canDelete || showAuthorActions;
  const blockFormId = `post-menu-block-${post.id}`;
  const deleteFormId = `post-menu-delete-${post.id}`;
  const unfollowFormId = `post-menu-unfollow-${post.id}`;
  if (!hasActions) {
    return null;
  }

  return (
    <DismissibleDetails className="group relative shrink-0" group="buddy-post-menu">
      <summary
        aria-label="更多操作"
        className="grid size-11 cursor-pointer list-none place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-ink [&::-webkit-details-marker]:hidden"
      >
        <MoreHorizontal size={20} />
      </summary>
      <div className="absolute right-0 top-12 z-40 w-56 overflow-hidden rounded-2xl border border-border-soft bg-white py-2 shadow-popover">
        {scope === "discover" && showAuthorActions ? (
          <>
            <form action={followFromCircle}>
              <input name="targetId" type="hidden" value={post.author.id} />
              <input name="returnTo" type="hidden" value={returnTo} />
              <MenuButton icon={<UserPlus size={18} />} label={`关注 @${post.author.username}`} />
            </form>
            <form id={blockFormId} action={blockFromCircle}>
              <input name="targetId" type="hidden" value={post.author.id} />
              <input name="returnTo" type="hidden" value={returnTo} />
              <MenuButton
                confirmMessage={`确认屏蔽 @${post.author.username}？屏蔽后将不再看到对方的帖子。`}
                formId={blockFormId}
                icon={<Ban size={18} />}
                label={`屏蔽 @${post.author.username}`}
              />
            </form>
          </>
        ) : null}

        {scope === "following" && showAuthorActions ? (
          <form id={unfollowFormId} action={unfollowFromCircle}>
            <input name="targetId" type="hidden" value={post.author.id} />
            <input name="returnTo" type="hidden" value={returnTo} />
            <MenuButton
              confirmMessage={`确认取消关注 @${post.author.username}？`}
              formId={unfollowFormId}
              icon={<UserMinus size={18} />}
              label={`取消关注 @${post.author.username}`}
            />
          </form>
        ) : null}

        {post.canDelete ? (
          <form id={deleteFormId} action={deletePost}>
            <input name="postId" type="hidden" value={post.id} />
            <input name="returnTo" type="hidden" value={returnTo} />
            <MenuButton danger confirmMessage="确认删除这条帖子？删除后不可恢复。" formId={deleteFormId} icon={<Trash2 size={18} />} label="删除帖子" />
          </form>
        ) : null}
      </div>
    </DismissibleDetails>
  );
}

function MenuButton({
  confirmMessage,
  danger = false,
  formId,
  icon,
  label
}: {
  confirmMessage?: string;
  danger?: boolean;
  formId?: string;
  icon: ReactNode;
  label: string;
}) {
  const className = cn(
    "flex min-h-11 w-full items-center gap-3 px-4 text-left text-sm font-semibold transition hover:bg-slate-50",
    danger ? "text-coral" : "text-slate-700"
  );

  if (confirmMessage && formId) {
    return (
      <ConfirmSubmitButton className={className} form={formId} message={confirmMessage}>
        {icon}
        {label}
      </ConfirmSubmitButton>
    );
  }

  return (
    <button
      className={className}
      type="submit"
    >
      {icon}
      {label}
    </button>
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
  return `/buddy-circle?${query.toString()}`;
}

function formatDateTime(value: Date | string) {
  return new Date(value).toLocaleString("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
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
  redirect(withPostSentNotice(getReturnTo(formData)));
}

async function markFollowingFeedAsRead(readThroughAt: string) {
  "use server";
  const user = await requireUser();
  if (user.role !== "student") {
    return;
  }
  const parsedReadThroughAt = new Date(readThroughAt);
  if (!Number.isFinite(parsedReadThroughAt.getTime())) {
    return;
  }
  await markFollowingFeedRead(user.id, parsedReadThroughAt);
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

function withPostSentNotice(returnTo: string) {
  const url = new URL(`http://local${returnTo}`);
  url.searchParams.set("notice", "post-sent");
  return `${url.pathname}${url.search}`;
}

function redirectWithError(formData: FormData, error: unknown): never {
  const buddyError = formatBuddyError(error);
  const returnTo = new URL(`http://local${getReturnTo(formData)}`);
  returnTo.searchParams.set("error", buddyError?.code || "UNKNOWN");
  redirect(`${returnTo.pathname}${returnTo.search}`);
}
