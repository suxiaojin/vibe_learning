"use client";

import { Heart, Repeat2, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function SocialPostActions({
  canLike,
  canRepost,
  initialLikeCount,
  initialLiked,
  initialRepostCount,
  initialReposted,
  postId,
  repostSource
}: {
  canLike: boolean;
  canRepost: boolean;
  initialLikeCount: number;
  initialLiked: boolean;
  initialRepostCount: number;
  initialReposted: boolean;
  postId: string;
  repostSource?: {
    authorName: string;
    content: string;
    createdAtLabel: string;
    username: string;
  };
}) {
  const [liked, setLiked] = useState(initialLiked);
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [reposted, setReposted] = useState(initialReposted);
  const [repostCount, setRepostCount] = useState(initialRepostCount);
  const [repostContent, setRepostContent] = useState("");
  const [repostOpen, setRepostOpen] = useState(false);
  const [busy, setBusy] = useState<"like" | "repost" | null>(null);

  async function toggleLike() {
    if (busy || (!canLike && !liked)) {
      return;
    }
    const nextLiked = !liked;
    setBusy("like");
    setLiked(nextLiked);
    setLikeCount((count) => Math.max(0, count + (nextLiked ? 1 : -1)));
    try {
      const response = await fetch(`/api/buddy-posts/${postId}/like`, {
        method: nextLiked ? "POST" : "DELETE"
      });
      if (!response.ok) {
        throw new Error("LIKE_FAILED");
      }
    } catch {
      setLiked(liked);
      setLikeCount(likeCount);
    } finally {
      setBusy(null);
    }
  }

  async function submitRepost() {
    if (busy || !canRepost) {
      return;
    }
    setBusy("repost");
    try {
      const response = await fetch(`/api/buddy-posts/${postId}/repost`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: repostContent })
      });
      if (!response.ok) {
        throw new Error("REPOST_FAILED");
      }
      if (!reposted) {
        setRepostCount((count) => count + 1);
      }
      setReposted(true);
      setRepostContent("");
      setRepostOpen(false);
    } catch {
      setReposted(reposted);
      setRepostCount(repostCount);
    } finally {
      setBusy(null);
    }
  }

  async function cancelRepost() {
    if (busy || !reposted) {
      return;
    }
    setBusy("repost");
    setReposted(false);
    setRepostCount((count) => Math.max(0, count - 1));
    try {
      const response = await fetch(`/api/buddy-posts/${postId}/repost`, {
        method: "DELETE"
      });
      if (!response.ok) {
        throw new Error("UNREPOST_FAILED");
      }
    } catch {
      setReposted(true);
      setRepostCount(repostCount);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-8">
      <button
        aria-label={liked ? "取消点赞" : "点赞"}
        className={cn(
          "inline-flex min-h-9 min-w-16 items-center gap-2 rounded-full px-2 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-60",
          liked ? "text-pink-500" : "text-slate-400 hover:text-pink-500"
        )}
        disabled={busy === "like" || (!canLike && !liked)}
        type="button"
        onClick={toggleLike}
      >
        <Heart className={liked ? "fill-current" : ""} size={18} />
        <span>{likeCount}</span>
      </button>

      {typeof repostSource !== "undefined" ? (
        reposted ? (
          <button
            aria-label="取消转帖"
            className="inline-flex min-h-9 min-w-16 items-center gap-2 rounded-full px-2 text-sm font-black text-teal transition hover:text-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={busy === "repost"}
            type="button"
            onClick={cancelRepost}
          >
            <Repeat2 size={18} />
            <span>{repostCount}</span>
          </button>
        ) : (
          <>
            <button
              aria-label="转帖"
              className="inline-flex min-h-9 min-w-16 items-center gap-2 rounded-full px-2 text-sm font-black text-slate-400 transition hover:text-teal disabled:cursor-not-allowed disabled:opacity-60"
              disabled={busy === "repost" || !canRepost}
              type="button"
              onClick={() => setRepostOpen(true)}
            >
              <Repeat2 size={18} />
              <span>{repostCount}</span>
            </button>

            {repostOpen ? (
              <div className="fixed inset-0 z-50 grid place-items-start justify-center overflow-y-auto bg-ink/35 px-4 py-12">
                <div className="relative w-full max-w-2xl rounded-2xl bg-white p-5 shadow-[0_18px_60px_rgba(15,23,42,0.24)]">
                  <div className="flex items-center justify-between gap-3">
                    <button
                      aria-label="关闭转帖"
                      className="grid size-9 place-items-center rounded-full text-ink hover:bg-slate-100"
                      type="button"
                      onClick={() => setRepostOpen(false)}
                    >
                      <X size={22} />
                    </button>
                    <button
                      className="min-h-10 rounded-full bg-ink px-6 text-sm font-black text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                      disabled={busy === "repost"}
                      type="button"
                      onClick={submitRepost}
                    >
                      发帖
                    </button>
                  </div>
                  <textarea
                    className="mt-5 min-h-56 w-full resize-y border-0 text-xl font-semibold leading-8 text-ink outline-none placeholder:text-slate-400"
                    maxLength={300}
                    placeholder="添加评论"
                    value={repostContent}
                    onChange={(event) => setRepostContent(event.target.value)}
                  />
                  <div className="mt-4 rounded-2xl border border-slate-200 p-4">
                    <p className="text-sm font-black text-ink">{repostSource.authorName}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-400">@{repostSource.username} · {repostSource.createdAtLabel}</p>
                    <p className="mt-3 whitespace-pre-wrap text-sm font-semibold leading-7 text-slate-700">{repostSource.content}</p>
                  </div>
                </div>
              </div>
            ) : null}
          </>
        )
      ) : null}
    </div>
  );
}
