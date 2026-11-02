"use client";

import { Gem } from "lucide-react";
import { useEffect, useState } from "react";
import { ProjectPurchaseFeedback } from "@/components/ai-study/project-purchase-feedback";
import { usePastExamPurchase } from "./use-past-exam-purchase";

export type PastExamSummary = { id: string; title: string; diamondPrice: number; purchased: boolean; questionIds: string[] };
export const pastExamStorageKey = (userId: string, paperId: string) => `vibe-past-exam:${userId}:${paperId}`;
const tones = [
  { fill: "bg-gradient-to-r from-teal to-cyan-400", track: "bg-cyan-50" },
  { fill: "bg-gradient-to-r from-[#58cc02] to-emerald-400", track: "bg-emerald-50" },
  { fill: "bg-gradient-to-r from-amber-400 to-orange-500", track: "bg-amber-50" },
  { fill: "bg-gradient-to-r from-fuchsia-400 to-violet-500", track: "bg-violet-50" },
  { fill: "bg-gradient-to-r from-sky-400 to-blue-500", track: "bg-sky-50" }
];

export function PastExamList({ courseKey, papers, userId }: { courseKey: string; papers: PastExamSummary[]; userId: string }) {
  const [progress, setProgress] = useState<Record<string, { count: number; submitted: boolean }>>({});
  useEffect(() => {
    function refresh() {
      const next: Record<string, { count: number; submitted: boolean }> = {};
      for (const paper of papers) {
        try {
          const stored = JSON.parse(localStorage.getItem(pastExamStorageKey(userId, paper.id)) || "null");
          if (stored?.signature === paper.questionIds.join("|")) next[paper.id] = { count: paper.questionIds.filter((id) => Array.isArray(stored.answers?.[id]) && stored.answers[id].some((v: unknown) => typeof v === "string" && v.trim())).length, submitted: Boolean(stored.results && Object.keys(stored.results).length) };
        } catch { /* Storage may be unavailable. */ }
      }
      setProgress(next);
    }
    refresh();
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, [papers, userId]);
  if (!papers.length) return <div className="rounded-2xl bg-white p-10 text-center text-slate-500">当前课程暂无已发布的历年真题。</div>;
  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <div className="grid min-h-[64px] grid-cols-[minmax(300px,1fr)_150px_260px_124px] items-center bg-slate-50/90 px-5 text-sm font-semibold text-slate-500"><div>题库名称</div><div className="text-center">钻石数</div><div className="text-center">进度</div><div className="text-right">操作</div></div>
    {papers.map((paper, index) => {
      return <PastExamRow key={`${paper.id}:${paper.diamondPrice}:${paper.purchased}`} paper={paper} courseKey={courseKey} index={index} progress={progress[paper.id]} />;
    })}
  </section>;
}

function PastExamRow({ paper, courseKey, index, progress }: { paper: PastExamSummary; courseKey: string; index: number; progress?: { count: number; submitted: boolean } }) {
      const purchase = usePastExamPurchase(paper, courseKey);
      const count = progress?.count || 0;
      const percent = paper.questionIds.length ? Math.min(100, Math.round(count / paper.questionIds.length * 100)) : 0;
      const tone = tones[index % tones.length];
      return <><div className="grid min-h-[68px] grid-cols-[minmax(300px,1fr)_150px_260px_124px] items-center border-t border-slate-100 px-5 text-[15px] text-slate-600 transition hover:bg-teal/5">
        <button type="button" disabled={purchase.pending} onClick={purchase.open} className="min-w-0 truncate pr-4 text-left font-semibold text-ink hover:text-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/25">{paper.title}</button>
        <div className="flex items-center justify-center gap-1.5 font-semibold">{purchase.offer.purchased ? <span className="text-teal">已购买</span> : <><Gem aria-hidden="true" className="text-sky-500" size={16} />{purchase.offer.diamondPrice}</>}</div>
        <div className="flex min-w-0 items-center gap-3"><div className={`h-3 min-w-32 flex-1 overflow-hidden rounded-full ${tone.track}`}><div className={`h-full rounded-full transition-all ${tone.fill}`} style={{ width: `${percent}%` }} /></div><span className="w-20 shrink-0 text-right text-xs font-semibold text-slate-500">已答 {count}/{paper.questionIds.length}</span></div>
        <div className="text-right"><button type="button" disabled={purchase.pending} onClick={purchase.open} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-teal px-4 text-sm font-semibold text-white transition hover:bg-teal/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/25 disabled:opacity-60">{purchase.pending ? "处理中" : progress?.submitted ? "查看结果" : count ? "继续答题" : "开始答题"}</button></div>
      </div><ProjectPurchaseFeedback {...purchase.dialogProps} /></>;
}
