"use client";

import { useEffect, useState } from "react";

type StoredPracticeState = {
  answers?: unknown;
  answerStates?: unknown;
  questionIdsSignature?: string;
};

type ProgressTone = {
  fill: string;
  track: string;
};

const tones: ProgressTone[] = [
  { fill: "bg-gradient-to-r from-teal to-cyan-400", track: "bg-cyan-50" },
  { fill: "bg-gradient-to-r from-[#58cc02] to-emerald-400", track: "bg-emerald-50" },
  { fill: "bg-gradient-to-r from-amber-400 to-orange-500", track: "bg-amber-50" },
  { fill: "bg-gradient-to-r from-fuchsia-400 to-violet-500", track: "bg-violet-50" },
  { fill: "bg-gradient-to-r from-sky-400 to-blue-500", track: "bg-sky-50" }
];

export function SpecialPracticeProgress({
  fallbackTotal,
  sectionId,
  toneIndex
}: {
  fallbackTotal: number;
  sectionId: string;
  toneIndex: number;
}) {
  const [progress, setProgress] = useState(() => readPracticeProgress(sectionId, fallbackTotal));
  const tone = tones[toneIndex % tones.length];
  const percent = progress.total > 0 ? Math.min(100, Math.round((progress.attempted / progress.total) * 100)) : 0;
  const label = progress.total > 0 ? `已答 ${progress.attempted}/${progress.total}` : "未开始";

  useEffect(() => {
    function refresh() {
      setProgress(readPracticeProgress(sectionId, fallbackTotal));
    }

    refresh();
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, [fallbackTotal, sectionId]);

  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className={`h-3 min-w-32 flex-1 overflow-hidden rounded-full ${tone.track}`}>
        <div className={`h-full rounded-full transition-all ${tone.fill}`} style={{ width: `${percent}%` }} />
      </div>
      <span className="w-20 shrink-0 text-right text-xs font-semibold text-slate-500">{label}</span>
    </div>
  );
}

function readPracticeProgress(sectionId: string, fallbackTotal: number) {
  const fallback = { attempted: 0, total: Math.max(0, fallbackTotal) };

  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(`vibe-special-practice:${sectionId}`);
    if (!raw) {
      return fallback;
    }

    const stored = JSON.parse(raw) as StoredPracticeState;
    const questionIds = parseQuestionIds(stored.questionIdsSignature);
    const total = questionIds.length || fallback.total;
    const attemptedIds = new Set<string>();

    collectAttemptedIds(stored.answerStates, attemptedIds);
    collectAttemptedIds(stored.answers, attemptedIds);

    return {
      attempted: Math.min(attemptedIds.size, total),
      total
    };
  } catch {
    return fallback;
  }
}

function parseQuestionIds(signature: unknown) {
  return typeof signature === "string" && signature.trim()
    ? signature.split("|").map((item) => item.trim()).filter(Boolean)
    : [];
}

function collectAttemptedIds(value: unknown, target: Set<string>) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return;
  }

  for (const [questionId, answer] of Object.entries(value as Record<string, unknown>)) {
    if (Array.isArray(answer) ? answer.length > 0 : Boolean(answer)) {
      target.add(questionId);
    }
  }
}
