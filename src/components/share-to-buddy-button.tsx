"use client";

import { CheckCircle2, Loader2, Send, Share2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { BuddyShareCardView } from "@/components/buddy-share-card";
import { notifyBuddyPostSent } from "@/components/post-success-toast";
import type { ShareCopyContext } from "@prisma/client";
import type { BuddyShareCard } from "@/lib/buddy-share-cards";
import { cn } from "@/lib/utils";

type BuddyPostResponse = {
  ok: boolean;
  error?: {
    message?: string;
  };
};

type ShareCopyResponse = {
  ok: boolean;
  data?: {
    styles: ShareCopyStyle[];
  };
};

type ShareCopyStyle = {
  id: string;
  label: string;
  phrases: Array<{
    id: string;
    content: string;
  }>;
};

const maxShareLength = 300;

export type ShareCopySuggestion = {
  content: string;
  label: string;
};

export function ShareToBuddyButton({
  buttonClassName,
  buttonLabel = "分享到搭子圈",
  contentSuggestions = [],
  copyContext,
  defaultContent,
  shareCard,
  sourceLabel = "学习动态"
}: {
  buttonClassName?: string;
  buttonLabel?: string;
  contentSuggestions?: ShareCopySuggestion[];
  copyContext?: ShareCopyContext;
  defaultContent: string;
  shareCard?: BuddyShareCard;
  sourceLabel?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState(defaultContent);
  const [dynamicStyles, setDynamicStyles] = useState<ShareCopyStyle[]>([]);
  const [error, setError] = useState("");
  const [phraseIndexes, setPhraseIndexes] = useState<Record<string, number>>({});
  const [open, setOpen] = useState(false);
  const [shared, setShared] = useState(false);
  const styleOptions = dynamicStyles.length > 0 ? dynamicStyles : contentSuggestions.map((suggestion) => ({
    id: suggestion.label,
    label: suggestion.label,
    phrases: [{ id: suggestion.label, content: suggestion.content }]
  }));

  useEffect(() => {
    setDraft(defaultContent);
    setError("");
    setShared(false);
  }, [defaultContent]);

  useEffect(() => {
    if (!copyContext) {
      setDynamicStyles([]);
      return;
    }

    const context = copyContext;
    let cancelled = false;
    async function loadShareCopy() {
      try {
        const response = await fetch(`/api/share-copy?context=${encodeURIComponent(context)}`, { cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as ShareCopyResponse | null;
        if (!response.ok || !payload?.ok) {
          throw new Error("SHARE_COPY_LOAD_FAILED");
        }
        if (!cancelled) {
          setDynamicStyles((payload.data?.styles || []).filter((style) => style.phrases.length > 0));
        }
      } catch {
        if (!cancelled) {
          setDynamicStyles([]);
        }
      }
    }

    void loadShareCopy();
    return () => {
      cancelled = true;
    };
  }, [copyContext]);

  function applyStyle(style: ShareCopyStyle) {
    if (style.phrases.length === 0) {
      return;
    }
    const currentIndex = getStylePhraseIndex(style, draft, phraseIndexes);
    const isCurrentStyle = style.phrases.some((phrase) => phrase.content === draft);
    const nextIndex = isCurrentStyle ? (currentIndex + 1) % style.phrases.length : currentIndex;
    setPhraseIndexes((current) => ({ ...current, [style.id]: nextIndex }));
    setDraft(style.phrases[nextIndex]?.content || defaultContent);
  }

  async function submitShare() {
    const content = draft.trim();
    if (!content || busy) {
      return;
    }

    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/buddy-posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, share: shareCard || null })
      });
      const payload = (await response.json().catch(() => null)) as BuddyPostResponse | null;
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error?.message || "发布失败，请稍后再试。");
      }
      setShared(true);
      setOpen(false);
      notifyBuddyPostSent();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "发布失败，请稍后再试。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        className={cn(
          "inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-600 transition hover:border-teal/40 hover:text-teal disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400",
          buttonClassName
        )}
        disabled={!defaultContent.trim()}
        type="button"
        onClick={() => {
          setDraft(defaultContent);
          setError("");
          setOpen(true);
        }}
      >
        {shared ? <CheckCircle2 size={17} /> : <Share2 size={17} />}
        {shared ? "已分享" : buttonLabel}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-start justify-center overflow-y-auto bg-ink/35 px-4 py-10">
          <div className="relative w-full max-w-xl rounded-2xl bg-white p-5 shadow-[0_18px_60px_rgba(15,23,42,0.24)]">
            <div className="flex items-center justify-between gap-3">
              <button
                aria-label="关闭分享"
                className="grid size-9 place-items-center rounded-full text-ink transition hover:bg-slate-100"
                type="button"
                onClick={() => setOpen(false)}
              >
                <X size={22} />
              </button>
              <div className="min-w-0 flex-1 text-center">
                <p className="truncate text-sm font-black text-ink">分享到搭子圈</p>
                <p className="mt-0.5 truncate text-xs font-semibold text-slate-400">{sourceLabel}</p>
              </div>
              <button
                className="inline-flex min-h-10 items-center gap-2 rounded-full bg-ink px-5 text-sm font-black text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                disabled={busy || !draft.trim()}
                type="button"
                onClick={submitShare}
              >
                {busy ? <Loader2 className="animate-spin" size={17} /> : <Send size={17} />}
                发布
              </button>
            </div>

            <textarea
              className="mt-5 min-h-32 w-full resize-y rounded-2xl border-2 border-slate-100 bg-slate-50 px-4 py-3 text-base font-semibold leading-7 text-ink outline-none transition placeholder:text-slate-400 focus:border-teal/40 focus:bg-white"
              maxLength={maxShareLength}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            {styleOptions.length > 0 ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs font-black text-slate-400">换一句</span>
                {styleOptions.map((style) => {
                  const phraseIndex = getStylePhraseIndex(style, draft, phraseIndexes);
                  return (
                    <button
                      key={style.id}
                      className={cn(
                        "min-h-8 rounded-full border px-3 text-xs font-black transition",
                        style.phrases.some((phrase) => phrase.content === draft)
                          ? "border-teal bg-teal/10 text-teal"
                          : "border-slate-200 bg-white text-slate-500 hover:border-teal/40 hover:text-teal"
                      )}
                      type="button"
                      onClick={() => applyStyle(style)}
                    >
                      {style.label}（{phraseIndex + 1}/{style.phrases.length}）
                    </button>
                  );
                })}
              </div>
            ) : null}
            {shareCard ? (
              <div className="mt-4">
                <BuddyShareCardView card={shareCard} compact />
              </div>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold">
              <span className={error ? "text-coral" : "text-slate-400"}>{error || "发布后会出现在发现流和关注你的同学的信息流中。"}</span>
              <span className="text-slate-400">{draft.length}/{maxShareLength}</span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function getStylePhraseIndex(style: ShareCopyStyle, draft: string, phraseIndexes: Record<string, number>) {
  const draftIndex = style.phrases.findIndex((phrase) => phrase.content === draft);
  if (draftIndex >= 0) {
    return draftIndex;
  }
  return Math.min(phraseIndexes[style.id] ?? 0, Math.max(0, style.phrases.length - 1));
}
