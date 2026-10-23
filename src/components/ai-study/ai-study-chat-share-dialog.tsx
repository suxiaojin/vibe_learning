"use client";

import { type FormEvent, useEffect, useState } from "react";
import { Loader2, Send, X } from "lucide-react";
import { BuddyShareCardView } from "@/components/buddy-share-card";
import { notifyBuddyPostSent } from "@/components/post-success-toast";
import type { BuddyAiStudyQaShareCard } from "@/lib/buddy-share-cards";

type BuddyPostResponse = {
  ok: boolean;
  error?: { message?: string };
};

const maxOpinionLength = 300;

export function AiStudyChatShareDialog({
  answer,
  materialTitle,
  messageId,
  nodeTitle,
  onClose,
  onPublished,
  question
}: {
  answer: string;
  materialTitle: string;
  messageId: string;
  nodeTitle: string;
  onClose: () => void;
  onPublished: (messageId: string) => void;
  question: string;
}) {
  const [opinion, setOpinion] = useState("");
  const [showSource, setShowSource] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const shareCard: BuddyAiStudyQaShareCard = {
    type: "ai_study_qa_card",
    question,
    answer,
    ...(showSource ? { materialTitle, nodeTitle } : {})
  };

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [busy, onClose]);

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/buddy-posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: opinion.trim(),
          share: shareCard
        })
      });
      const payload = (await response.json().catch(() => null)) as BuddyPostResponse | null;
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error?.message || "发布失败，请稍后再试。");
      }
      onPublished(messageId);
      notifyBuddyPostSent();
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "发布失败，请稍后再试。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-[110] flex items-start justify-center overflow-y-auto bg-[#111827]/45 px-3 py-6 sm:px-6 sm:py-12"
      onMouseDown={(event) => { if (!busy && event.target === event.currentTarget) onClose(); }}
    >
      <form
        aria-busy={busy}
        aria-labelledby="ai-study-share-title"
        aria-modal="true"
        className="w-full max-w-[640px] rounded-[22px] bg-white p-5 shadow-[0_24px_70px_rgba(15,23,42,0.24)] sm:p-6"
        onSubmit={(event) => { void publish(event); }}
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-[#111827]" id="ai-study-share-title">分享到一起上岸</h2>
            <p className="mt-1 text-xs text-[#667085]">可以写下你的看法，再确认这次提问和回答。</p>
          </div>
          <button
            aria-label="关闭分享预览"
            className="grid size-8 shrink-0 place-items-center rounded-full text-[#667085] hover:bg-[#f3f4f6]"
            disabled={busy}
            onClick={onClose}
            type="button"
          >
            <X size={19} />
          </button>
        </div>

        <label className="mt-5 block text-sm font-semibold text-[#344054]" htmlFor="ai-study-share-opinion">说说你的看法（选填）</label>
        <textarea
          autoFocus
          className="mt-2 min-h-[110px] w-full resize-y rounded-[14px] border border-[#d9e0e8] px-3 py-3 text-sm leading-6 text-[#1f2937] outline-none placeholder:text-[#98a2b3] focus:border-[#8caf9d] focus:ring-2 focus:ring-[#e4f3e9]"
          disabled={busy}
          id="ai-study-share-opinion"
          maxLength={maxOpinionLength}
          onChange={(event) => setOpinion(event.target.value)}
          placeholder="这段回答让你想到了什么？"
          value={opinion}
        />
        <p className="mt-1 text-right text-xs text-[#98a2b3]">{opinion.length}/{maxOpinionLength}</p>

        <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-[#475467]">
          <input
            checked={showSource}
            className="size-4 accent-[#168144]"
            disabled={busy}
            onChange={(event) => setShowSource(event.target.checked)}
            type="checkbox"
          />
          在帖子中显示资料名称和知识点
        </label>

        <div className="mt-4 max-h-[42vh] overflow-y-auto rounded-2xl">
          <BuddyShareCardView card={shareCard} full />
        </div>
        {error ? <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600" role="alert">{error}</p> : null}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#edf0f4] pt-4">
          <p className="text-xs text-[#667085]">发布后会出现在一起上岸，问答仅包含本次对话。</p>
          <button
            className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[#168144] px-5 text-sm font-semibold text-white transition hover:bg-[#116a37] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={busy}
            type="submit"
          >
            {busy ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
            发布到一起上岸
          </button>
        </div>
      </form>
    </div>
  );
}
