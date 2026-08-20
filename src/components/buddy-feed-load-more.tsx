"use client";

import type { ReactNode } from "react";
import { Ban, Loader2, MoreHorizontal, Trash2, UserMinus, UserPlus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { DismissibleDetails } from "@/components/dismissible-details";
import { SocialPostCard, type SocialPostNode } from "@/components/social-post-card";
import { SocialPostActions } from "@/components/social-post-actions";
import { EmptyState } from "@/components/student-ui";
import type { BuddyShareCard, BuddyShareType } from "@/lib/buddy-share-cards";
import { cn } from "@/lib/utils";

type FeedScope = "discover" | "following";
type FeedSort = "latest" | "hot";

type FeedUser = {
  id: string;
  username: string;
  nickname: string;
  avatarImage?: string;
  avatarColor?: string;
  gender?: "male" | "female" | null;
  province?: string | null;
  studySystem?: string | null;
  majorName?: string | null;
  medalLevel: "novice" | "expert" | "scholar";
  medalLabel: string;
};

type FeedPostSource = {
  id: string;
  type: "original" | "repost";
  content: string;
  createdAt: Date | string;
  sharePayload: BuddyShareCard | null;
  shareType: BuddyShareType | null;
  author: FeedUser;
  likeCount: number;
  repostCount: number;
  likedByMe: boolean;
  repostedByMe: boolean;
  canLike: boolean;
  canRepost: boolean;
  sourceState: "visible" | "deleted";
  originalPost: FeedPostSource | null;
};

export type FeedPost = {
  id: string;
  type: "original" | "repost";
  content: string;
  createdAt: Date | string;
  sharePayload: BuddyShareCard | null;
  shareType: BuddyShareType | null;
  author: FeedUser;
  likeCount: number;
  repostCount: number;
  likedByMe: boolean;
  repostedByMe: boolean;
  canLike: boolean;
  canRepost: boolean;
  canDelete: boolean;
  sourceState: "visible" | "deleted";
  originalPost: FeedPostSource | null;
};

type FeedResponse = {
  ok: boolean;
  data?: {
    items: FeedPost[];
    nextCursor: string | null;
  };
};

export function BuddyFeedLoadMore({
  initialItems,
  initialNextCursor,
  majorId,
  province,
  scope,
  sort,
  studySystem
}: {
  initialItems: FeedPost[];
  initialNextCursor: string | null;
  majorId?: string;
  province?: string;
  scope: FeedScope;
  sort: FeedSort;
  studySystem?: string;
}) {
  const [items, setItems] = useState<FeedPost[]>(initialItems);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const queryBase = useMemo(() => {
    const params = new URLSearchParams();
    params.set("limit", "20");
    params.set("tab", scope);
    params.set("sort", sort);
    if (province) params.set("province", province);
    if (studySystem) params.set("studySystem", studySystem);
    if (majorId) params.set("majorId", majorId);
    return params;
  }, [majorId, province, scope, sort, studySystem]);

  useEffect(() => {
    setItems(initialItems);
    setNextCursor(initialNextCursor);
    setHiddenIds([]);
    setLoadError(false);
  }, [initialItems, initialNextCursor, queryBase]);

  useEffect(() => {
    if (scope !== "discover" || sort !== "latest" || province || studySystem || majorId) {
      return;
    }

    function prependCreatedPost(event: Event) {
      const post = (event as CustomEvent<FeedPost>).detail;
      if (!post?.id) {
        return;
      }
      setItems((current) => current.some((item) => item.id === post.id) ? current : [post, ...current]);
    }

    window.addEventListener("buddy-post-created", prependCreatedPost);
    return () => window.removeEventListener("buddy-post-created", prependCreatedPost);
  }, [majorId, province, scope, sort, studySystem]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !nextCursor || loadError) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          void loadMore();
        }
      },
      { rootMargin: "360px 0px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadError, loading, nextCursor, queryBase]);

  async function loadMore() {
    if (!nextCursor || loading) {
      return;
    }
    setLoading(true);
    setLoadError(false);
    try {
      const params = new URLSearchParams(queryBase);
      params.set("cursor", nextCursor);
      const response = await fetch(`/api/buddy-posts?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as FeedResponse | null;
      if (!response.ok || !payload?.ok || !payload.data) {
        throw new Error("LOAD_MORE_FAILED");
      }
      const data = payload.data;
      setItems((current) => {
        const existingIds = new Set(current.map((item) => item.id));
        return [...current, ...data.items.filter((item) => !existingIds.has(item.id))];
      });
      setNextCursor(data.nextCursor);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  const visibleItems = items.filter((post) => !hiddenIds.includes(post.id));
  if (!nextCursor && visibleItems.length === 0) {
    return (
      <EmptyState
        title={scope === "following" ? "关注动态为空" : "暂时没有帖子"}
        description={scope === "following" ? "你关注的人还没有发帖，可以先去发现页看看新的学习搭子。" : "暂时没有符合条件的帖子，换个筛选条件试试看。"}
      />
    );
  }

  return (
    <>
      {visibleItems.map((post) => (
        <ClientBuddyPostCard
          key={post.id}
          post={post}
          scope={scope}
          onHidden={(postId) => setHiddenIds((current) => [...current, postId])}
        />
      ))}
      <div ref={sentinelRef} className="grid min-h-16 place-items-center text-sm font-bold text-slate-400">
        {loading ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="animate-spin" size={17} />
            正在加载
          </span>
        ) : loadError ? (
          <button
            className="secondary-button min-h-11 rounded-xl px-4 text-sm"
            type="button"
            onClick={() => void loadMore()}
          >
            加载失败，点击重试
          </button>
        ) : nextCursor ? (
          "继续下滑加载更多"
        ) : null}
      </div>
    </>
  );
}

export function ClientBuddyPostCard({
  onHidden,
  post,
  scope
}: {
  onHidden: (postId: string) => void;
  post: FeedPost;
  scope: FeedScope;
}) {
  return (
    <SocialPostCard
      actionMenu={<ClientPostMoreMenu onHidden={onHidden} post={post} scope={scope} />}
      getDateLabel={formatDateTime}
      post={post as SocialPostNode}
      renderActions={(targetPost) => <ClientPostActions post={targetPost} />}
    />
  );
}

function ClientPostActions({ post }: { post: SocialPostNode }) {
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

function ClientPostMoreMenu({
  onHidden,
  post,
  scope
}: {
  onHidden: (postId: string) => void;
  post: FeedPost;
  scope: FeedScope;
}) {
  const showAuthorActions = !post.canDelete;
  const hasActions = post.canDelete || showAuthorActions;
  if (!hasActions) {
    return null;
  }

  async function runAction(path: string, method: "POST" | "DELETE") {
    const response = await fetch(path, { method });
    if (response.ok) {
      onHidden(post.id);
    }
  }

  return (
    <DismissibleDetails className="group relative shrink-0" group="buddy-post-menu">
      <summary
        aria-label="更多操作"
        className="grid size-9 cursor-pointer list-none place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-ink [&::-webkit-details-marker]:hidden"
      >
        <MoreHorizontal size={20} />
      </summary>
      <div className="absolute right-0 top-11 z-40 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white py-2 shadow-[0_12px_32px_rgba(15,23,42,0.18)]">
        {scope === "discover" && showAuthorActions ? (
          <>
            <MenuButton icon={<UserPlus size={18} />} label={`关注 @${post.author.username}`} onClick={() => runAction(`/api/social/follows/${post.author.id}`, "POST")} />
            <MenuButton
              confirmMessage={`确认屏蔽 @${post.author.username}？屏蔽后将不再看到对方的帖子。`}
              icon={<Ban size={18} />}
              label={`屏蔽 @${post.author.username}`}
              onClick={() => runAction(`/api/social/blocks/${post.author.id}`, "POST")}
            />
          </>
        ) : null}

        {scope === "following" && showAuthorActions ? (
          <MenuButton
            confirmMessage={`确认取消关注 @${post.author.username}？`}
            icon={<UserMinus size={18} />}
            label={`取消关注 @${post.author.username}`}
            onClick={() => runAction(`/api/social/follows/${post.author.id}`, "DELETE")}
          />
        ) : null}

        {post.canDelete ? (
          <MenuButton
            danger
            confirmMessage="确认删除这条帖子？删除后不可恢复。"
            icon={<Trash2 size={18} />}
            label="删除帖子"
            onClick={() => runAction(`/api/buddy-posts/${post.id}`, "DELETE")}
          />
        ) : null}
      </div>
    </DismissibleDetails>
  );
}

function MenuButton({
  confirmMessage,
  danger = false,
  icon,
  label,
  onClick
}: {
  confirmMessage?: string;
  danger?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "flex min-h-11 w-full items-center gap-3 px-4 text-left text-sm font-semibold transition hover:bg-slate-50",
        danger ? "text-coral" : "text-slate-700"
      )}
      type="button"
      onClick={() => {
        if (confirmMessage && !window.confirm(confirmMessage)) {
          return;
        }
        onClick();
      }}
    >
      {icon}
      {label}
    </button>
  );
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
