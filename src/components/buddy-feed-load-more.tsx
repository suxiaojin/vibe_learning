"use client";

import type { ReactNode } from "react";
import { Ban, Loader2, MoreHorizontal, Trash2, UserMinus, UserPlus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { SocialPostActions } from "@/components/social-post-actions";
import { cn } from "@/lib/utils";

type FeedScope = "discover" | "following";
type FeedSort = "latest" | "hot";

type FeedUser = {
  id: string;
  username: string;
  nickname: string;
  avatarImage?: string;
  avatarColor?: string;
  province?: string | null;
  studySystem?: string | null;
  majorName?: string | null;
};

type FeedPostSource = {
  id: string;
  type: "original" | "repost";
  content: string;
  createdAt: string;
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

type FeedPost = {
  id: string;
  type: "original" | "repost";
  content: string;
  createdAt: string;
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

const avatarColorClasses: Record<string, string> = {
  coral: "bg-coral",
  green: "bg-[#58cc02]",
  honey: "bg-honey",
  sky: "bg-sky-500",
  violet: "bg-violet-500"
};

export function BuddyFeedLoadMore({
  initialNextCursor,
  majorId,
  province,
  scope,
  sort,
  studySystem
}: {
  initialNextCursor: string | null;
  majorId?: string;
  province?: string;
  scope: FeedScope;
  sort: FeedSort;
  studySystem?: string;
}) {
  const [items, setItems] = useState<FeedPost[]>([]);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
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
    setItems([]);
    setNextCursor(initialNextCursor);
    setHiddenIds([]);
  }, [initialNextCursor, queryBase]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !nextCursor || sort !== "latest") {
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
  }, [loading, nextCursor, queryBase, sort]);

  async function loadMore() {
    if (!nextCursor || loading || sort !== "latest") {
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams(queryBase);
      params.set("cursor", nextCursor);
      const response = await fetch(`/api/buddy-posts?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as FeedResponse | null;
      if (!response.ok || !payload?.ok || !payload.data) {
        throw new Error("LOAD_MORE_FAILED");
      }
      const data = payload.data;
      setItems((current) => [...current, ...data.items]);
      setNextCursor(data.nextCursor);
    } catch {
      setNextCursor(null);
    } finally {
      setLoading(false);
    }
  }

  if (!initialNextCursor && items.length === 0) {
    return null;
  }

  return (
    <>
      {items.filter((post) => !hiddenIds.includes(post.id)).map((post) => (
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
        ) : nextCursor && sort === "latest" ? (
          "继续下滑加载更多"
        ) : null}
      </div>
    </>
  );
}

function ClientBuddyPostCard({
  onHidden,
  post,
  scope
}: {
  onHidden: (postId: string) => void;
  post: FeedPost;
  scope: FeedScope;
}) {
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
                {[post.author.province, post.author.studySystem, post.author.majorName].filter(Boolean).join(" - ") || "公开帖子"} - {formatDateTime(post.createdAt)}
              </p>
            </div>
            <ClientPostMoreMenu onHidden={onHidden} post={post} scope={scope} />
          </div>

          {post.type === "original" ? (
            <p className="mt-4 whitespace-pre-wrap text-sm font-semibold leading-7 text-slate-700">{post.content}</p>
          ) : (
            <div className="mt-4 space-y-3">
              {post.content ? <p className="whitespace-pre-wrap text-sm font-semibold leading-7 text-slate-700">{post.content}</p> : null}
              <ClientRepostSourceCard originalPost={post.originalPost} sourceState={post.sourceState} />
            </div>
          )}

          <div className="mt-4 border-t border-slate-100 pt-4">
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
          </div>
        </div>
      </div>
    </article>
  );
}

function ClientRepostSourceCard({
  depth = 0,
  originalPost,
  sourceState
}: {
  depth?: number;
  originalPost: FeedPost["originalPost"];
  sourceState: FeedPost["sourceState"];
}) {
  if (sourceState !== "visible" || !originalPost) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm font-bold text-slate-400">原内容已删除</p>
      </div>
    );
  }

  return (
    <div className={cn("rounded-2xl border border-slate-200 bg-slate-50 p-4", depth > 0 ? "bg-white/70" : "")}>
      <div className="flex items-start gap-3">
        <a href={`/students/${originalPost.author.id}`}>
          <ProfileAvatar user={originalPost.author} />
        </a>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <a className="font-black text-ink hover:text-teal" href={`/students/${originalPost.author.id}`}>
              {originalPost.author.nickname}
            </a>
            <span className="text-xs font-semibold text-slate-400">
              {[originalPost.author.province, originalPost.author.studySystem, originalPost.author.majorName].filter(Boolean).join(" - ") || "公开帖子"} - {formatDateTime(originalPost.createdAt)}
            </span>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-7 text-slate-600">{originalPost.content}</p>
          {originalPost.type === "repost" ? (
            <div className="mt-3 border-l-2 border-slate-200 pl-3">
              <ClientRepostSourceCard depth={depth + 1} originalPost={originalPost.originalPost} sourceState={originalPost.sourceState} />
            </div>
          ) : null}
          <div className="mt-3">
            <SocialPostActions
              canLike={originalPost.canLike}
              canRepost={originalPost.canRepost}
              initialLikeCount={originalPost.likeCount}
              initialLiked={originalPost.likedByMe}
              initialRepostCount={originalPost.repostCount}
              initialReposted={originalPost.repostedByMe}
              postId={originalPost.id}
              repostSource={getPostRepostSource(originalPost)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function getPostRepostSource(post: {
  author: { nickname: string; username: string };
  canRepost: boolean;
  content: string;
  createdAt: string;
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
            <MenuButton icon={<UserPlus size={18} />} label={`关注 @${post.author.username}`} onClick={() => runAction(`/api/social/follows/${post.author.id}`, "POST")} />
            <MenuButton icon={<Ban size={18} />} label={`屏蔽 @${post.author.username}`} onClick={() => runAction(`/api/social/blocks/${post.author.id}`, "POST")} />
          </>
        ) : null}

        {scope === "following" && showAuthorActions ? (
          <MenuButton icon={<UserMinus size={18} />} label={`取消关注 @${post.author.username}`} onClick={() => runAction(`/api/social/follows/${post.author.id}`, "DELETE")} />
        ) : null}

        {post.canDelete ? (
          <MenuButton danger icon={<Trash2 size={18} />} label="删除帖子" onClick={() => runAction(`/api/buddy-posts/${post.id}`, "DELETE")} />
        ) : null}
      </div>
    </details>
  );
}

function MenuButton({
  danger = false,
  icon,
  label,
  onClick
}: {
  danger?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "flex min-h-11 w-full items-center gap-3 px-4 text-left text-sm font-black transition hover:bg-slate-50",
        danger ? "text-coral" : "text-slate-700"
      )}
      type="button"
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
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

function formatDateTime(value: string) {
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
