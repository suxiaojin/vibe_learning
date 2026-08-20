"use client";

import { Loader2, Send, SmilePlus } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import type { FeedPost } from "@/components/buddy-feed-load-more";
import { notifyBuddyPostSent } from "@/components/post-success-toast";
import { SurfaceCard } from "@/components/student-ui";

type EmojiItem = {
  emoji: string;
  label: string;
};

type EmojibaseItem = {
  group?: unknown;
  label?: unknown;
  order?: unknown;
  unicode?: unknown;
};

type CreatePostResponse = {
  ok: boolean;
  data?: { post: FeedPost };
  error?: { message?: string };
};

const emojiDataUrl = "https://cdn.jsdelivr.net/npm/emojibase-data@17.0.0/zh/compact.json";
const composerMinHeight = 56;
const composerMaxHeight = 400;

function resizeComposerTextarea(textarea: HTMLTextAreaElement) {
  textarea.style.height = "0px";
  const contentHeight = textarea.scrollHeight;
  const nextHeight = Math.min(Math.max(contentHeight, composerMinHeight), composerMaxHeight);
  textarea.style.height = `${nextHeight}px`;
  textarea.style.overflowY = contentHeight > composerMaxHeight ? "auto" : "hidden";
}

export function BuddyPostComposer() {
  const [content, setContent] = useState("");
  const [emojis, setEmojis] = useState<EmojiItem[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerStatus, setPickerStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    resizeComposerTextarea(textarea);
    let observedWidth = Math.round(textarea.getBoundingClientRect().width);
    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(([entry]) => {
        const nextWidth = Math.round(entry.contentRect.width);
        if (nextWidth === observedWidth) {
          return;
        }
        observedWidth = nextWidth;
        resizeComposerTextarea(textarea);
      });
    resizeObserver?.observe(textarea);

    return () => resizeObserver?.disconnect();
  }, []);

  useEffect(() => {
    if (!pickerOpen) {
      return;
    }

    function closeOnOutsideClick(event: PointerEvent) {
      if (event.target instanceof Node && !pickerRef.current?.contains(event.target)) {
        setPickerOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPickerOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [pickerOpen]);

  useEffect(() => {
    if (!submitError) {
      return;
    }

    const timeoutId = window.setTimeout(() => setSubmitError(""), 4000);
    return () => window.clearTimeout(timeoutId);
  }, [submitError]);

  async function loadEmojis() {
    if (pickerStatus === "loading") {
      return;
    }

    setPickerStatus("loading");
    try {
      const response = await fetch(emojiDataUrl);
      const payload = (await response.json().catch(() => null)) as unknown;
      if (!response.ok || !Array.isArray(payload)) {
        throw new Error("EMOJI_LOAD_FAILED");
      }
      const nextEmojis = (payload as EmojibaseItem[])
        .filter((item) => item.group === 0 || item.group === 1)
        .filter((item) => typeof item.unicode === "string" && typeof item.label === "string")
        .sort((left, right) => Number(left.order || 0) - Number(right.order || 0))
        .slice(0, 160)
        .map((item) => ({
          emoji: item.unicode as string,
          label: item.label as string
        }));
      if (nextEmojis.length === 0) {
        throw new Error("EMOJI_LOAD_FAILED");
      }
      setEmojis(nextEmojis);
      setPickerStatus("ready");
    } catch {
      setPickerStatus("error");
    }
  }

  function togglePicker() {
    const nextOpen = !pickerOpen;
    setPickerOpen(nextOpen);
    if (nextOpen && emojis.length === 0 && pickerStatus !== "loading") {
      void loadEmojis();
    }
  }

  function insertEmoji(emoji: string) {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? content.length;
    const end = textarea?.selectionEnd ?? content.length;
    const nextContent = `${content.slice(0, start)}${emoji}${content.slice(end)}`;
    const nextCursor = start + emoji.length;
    setContent(nextContent);
    window.requestAnimationFrame(() => {
      if (textarea) {
        resizeComposerTextarea(textarea);
      }
      textarea?.focus();
      textarea?.setSelectionRange(nextCursor, nextCursor);
    });
  }

  async function submitPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) {
      return;
    }

    setSubmitting(true);
    setSubmitError("");
    try {
      const response = await fetch("/api/buddy-posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content })
      });
      const payload = (await response.json().catch(() => null)) as CreatePostResponse | null;
      if (!response.ok || !payload?.ok || !payload.data?.post) {
        throw new Error(payload?.error?.message || "发布失败，请稍后重试。");
      }

      window.dispatchEvent(new CustomEvent<FeedPost>("buddy-post-created", { detail: payload.data.post }));
      setContent("");
      setPickerOpen(false);
      notifyBuddyPostSent();
      window.requestAnimationFrame(() => {
        const textarea = textareaRef.current;
        if (textarea) {
          resizeComposerTextarea(textarea);
          textarea.focus();
        }
      });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "发布失败，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <SurfaceCard>
        <form aria-busy={submitting} className="space-y-3.5" onSubmit={submitPost}>
          <textarea
            ref={textareaRef}
            aria-describedby="buddy-post-content-hint"
            className="input min-h-14 max-h-[400px] resize-none overflow-y-hidden rounded-2xl border-0 bg-slate-50/90 px-4 py-3 text-[15px] font-medium leading-7 text-ink shadow-none placeholder:text-slate-400"
            disabled={submitting}
            name="content"
            placeholder="有什么想分享？"
            value={content}
            onChange={(event) => {
              setContent(event.target.value);
              resizeComposerTextarea(event.currentTarget);
            }}
          />
          {submitError ? (
            <p className="rounded-xl bg-coral/10 px-3 py-2 text-sm font-semibold text-coral" role="alert">
              {submitError}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div ref={pickerRef} className="relative shrink-0">
                <button
                  aria-controls="buddy-post-emoji-picker"
                  aria-expanded={pickerOpen}
                  aria-label="添加表情"
                  className={`grid size-10 place-items-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/30 disabled:cursor-not-allowed disabled:opacity-50 ${pickerOpen ? "bg-teal/10 text-teal" : "text-slate-600 hover:bg-slate-100 hover:text-teal"}`}
                  disabled={submitting}
                  title="添加表情"
                  type="button"
                  onClick={togglePicker}
                >
                  <SmilePlus size={22} />
                </button>

                {pickerOpen ? (
                  <div
                    id="buddy-post-emoji-picker"
                    aria-label="选择表情"
                    className="absolute left-0 top-full z-40 mt-2 w-80 max-w-[calc(100vw-3rem)] rounded-2xl border border-border-soft bg-white p-3 shadow-popover"
                    role="dialog"
                  >
                    <div className="mb-2 flex items-center justify-between px-1">
                      <p className="text-sm font-bold text-ink">选择表情</p>
                      <p className="text-xs font-medium text-slate-400">点击即可插入</p>
                    </div>

                    {pickerStatus === "loading" || pickerStatus === "idle" ? (
                      <div className="flex min-h-36 items-center justify-center gap-2 text-sm font-semibold text-slate-500" role="status">
                        <Loader2 className="animate-spin" size={18} />
                        正在加载表情
                      </div>
                    ) : null}

                    {pickerStatus === "error" ? (
                      <div className="grid min-h-36 place-items-center gap-3 px-4 text-center">
                        <p className="text-sm font-semibold text-slate-500">表情加载失败，请稍后重试。</p>
                        <button className="secondary-button min-h-10 rounded-xl px-4 text-sm" type="button" onClick={() => void loadEmojis()}>
                          重新加载
                        </button>
                      </div>
                    ) : null}

                    {pickerStatus === "ready" ? (
                      <div className="grid max-h-64 grid-cols-8 gap-1 overflow-y-auto overscroll-contain pr-1">
                        {emojis.map((item) => (
                          <button
                            key={`${item.emoji}-${item.label}`}
                            aria-label={item.label}
                            className="grid aspect-square place-items-center rounded-lg text-2xl transition hover:bg-teal/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/30"
                            title={item.label}
                            type="button"
                            onClick={() => insertEmoji(item.emoji)}
                          >
                            {item.emoji}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <p id="buddy-post-content-hint" className="min-w-0 text-[13px] font-medium text-slate-500">仅支持文字和表情，不能包含超链接、图片、视频或音频。</p>
            </div>

            <button
              className="primary-button min-h-12 min-w-[92px] rounded-2xl px-5 text-[15px] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={submitting}
              type="submit"
            >
              {submitting ? <Loader2 className="animate-spin" size={17} /> : <Send size={17} />}
              {submitting ? "发布中" : "发帖"}
            </button>
          </div>
        </form>
      </SurfaceCard>

    </>
  );
}
