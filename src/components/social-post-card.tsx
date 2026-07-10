import type { ReactNode } from "react";
import { BuddyShareCardView } from "@/components/buddy-share-card";
import { SocialPostAuthorHeader } from "@/components/social-post-author-header";
import type { BuddyShareCard } from "@/lib/buddy-share-cards";
import type { MedalLevel } from "@/lib/rewards";
import { cn } from "@/lib/utils";

export type SocialPostAvatarUser = {
  avatarColor?: string | null;
  avatarImage?: string | null;
  nickname: string;
};

export type SocialPostAuthor = SocialPostAvatarUser & {
  id: string;
  username: string;
  gender?: "male" | "female" | null;
  province?: string | null;
  studySystem?: string | null;
  majorName?: string | null;
  medalLevel: MedalLevel;
  medalLabel: string;
};

export type SocialPostNode = {
  id: string;
  type: "original" | "repost";
  content: string;
  createdAt: Date | string;
  sharePayload: BuddyShareCard | null;
  author: SocialPostAuthor;
  likeCount: number;
  repostCount: number;
  likedByMe: boolean;
  repostedByMe: boolean;
  canLike: boolean;
  canRepost: boolean;
  sourceState: "visible" | "deleted";
  originalPost: SocialPostNode | null;
};

const avatarColorClasses: Record<string, string> = {
  coral: "bg-coral",
  green: "bg-success",
  honey: "bg-honey",
  sky: "bg-sky-500",
  violet: "bg-violet-500"
};

export function SocialAvatar({
  className,
  href,
  size = "md",
  user
}: {
  className?: string;
  href?: string;
  size?: "sm" | "md" | "lg";
  user: SocialPostAvatarUser;
}) {
  const sizeClass =
    size === "lg"
      ? "size-20 text-3xl"
      : size === "sm"
        ? "size-11 text-base"
        : "size-12 text-lg";
  const avatar = user.avatarImage ? (
    <img
      alt={`${user.nickname} 的头像`}
      className={cn("shrink-0 rounded-full object-cover shadow-sm ring-1 ring-slate-200/80", sizeClass, className)}
      src={user.avatarImage}
    />
  ) : (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-semibold text-white shadow-sm ring-1 ring-slate-200/80",
        avatarColorClasses[user.avatarColor || "green"] || avatarColorClasses.green,
        sizeClass,
        className
      )}
    >
      {user.nickname.slice(0, 1).toUpperCase()}
    </span>
  );

  return href ? <a href={href}>{avatar}</a> : avatar;
}

export function SocialPostCard({
  actionMenu,
  className,
  embedded = false,
  getDateLabel,
  id,
  post,
  renderActions
}: {
  actionMenu?: ReactNode;
  className?: string;
  embedded?: boolean;
  getDateLabel: (value: Date | string) => string;
  id?: string;
  post: SocialPostNode;
  renderActions?: (post: SocialPostNode) => ReactNode;
}) {
  return (
    <article id={id} className={cn(embedded ? "scroll-mt-6 p-4 transition-colors target:bg-sky-50/70 sm:p-5" : "surface-card p-4 sm:p-5", className)}>
      <div className="flex min-w-0 items-start gap-3 sm:gap-4">
        <SocialAvatar href={`/students/${post.author.id}`} size="sm" user={post.author} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-2 sm:gap-3">
            <SocialPostAuthorHeader author={post.author} dateLabel={getDateLabel(post.createdAt)} />
            {actionMenu}
          </div>

          {post.type === "original" ? (
            <SocialPostBody content={post.content} sharePayload={post.sharePayload} />
          ) : (
            <div className="mt-4 min-w-0 space-y-3">
              {post.content ? <p className="whitespace-pre-wrap text-[15px] font-medium leading-7 text-ink/85">{post.content}</p> : null}
              <SocialRepostSourceCard
                getDateLabel={getDateLabel}
                originalPost={post.originalPost}
                renderActions={renderActions}
                sourceState={post.sourceState}
              />
            </div>
          )}

          {renderActions ? <div className="mt-4 border-t border-slate-100 pt-4">{renderActions(post)}</div> : null}
        </div>
      </div>
    </article>
  );
}

export function SocialRepostSourceCard({
  depth = 0,
  getDateLabel,
  originalPost,
  renderActions,
  sourceState
}: {
  depth?: number;
  getDateLabel: (value: Date | string) => string;
  originalPost: SocialPostNode | null;
  renderActions?: (post: SocialPostNode) => ReactNode;
  sourceState: "visible" | "deleted";
}) {
  if (sourceState !== "visible" || !originalPost) {
    return (
      <div className="rounded-2xl border border-border-soft/80 bg-surface-muted p-4">
        <p className="text-sm font-semibold text-slate-400">原内容已删除</p>
      </div>
    );
  }

  return (
    <div className={cn("min-w-0 overflow-hidden rounded-2xl border border-border-soft/80 bg-surface-muted p-3 sm:p-4", depth > 0 && "bg-surface/70")}>
      <div className="flex min-w-0 items-start gap-3">
        <SocialAvatar href={`/students/${originalPost.author.id}`} size="sm" user={originalPost.author} />
        <div className="min-w-0 flex-1">
          <SocialPostAuthorHeader author={originalPost.author} dateLabel={getDateLabel(originalPost.createdAt)} />
          <SocialPostBody compact content={originalPost.content} sharePayload={originalPost.sharePayload} />
          {originalPost.type === "repost" ? (
            <div className="mt-3 min-w-0 border-l-2 border-slate-200 pl-3">
              <SocialRepostSourceCard
                depth={depth + 1}
                getDateLabel={getDateLabel}
                originalPost={originalPost.originalPost}
                renderActions={renderActions}
                sourceState={originalPost.sourceState}
              />
            </div>
          ) : null}
          {renderActions ? <div className="mt-3">{renderActions(originalPost)}</div> : null}
        </div>
      </div>
    </div>
  );
}

function SocialPostBody({
  compact = false,
  content,
  sharePayload
}: {
  compact?: boolean;
  content: string;
  sharePayload: BuddyShareCard | null;
}) {
  return (
    <div className={cn(compact ? "mt-2" : "mt-4", "space-y-3")}>
      {content ? (
        <p className={cn("whitespace-pre-wrap font-medium leading-7 text-ink/85", compact ? "text-sm" : "text-[15px]")}>{content}</p>
      ) : null}
      <BuddyShareCardView card={sharePayload} compact={compact} />
    </div>
  );
}
