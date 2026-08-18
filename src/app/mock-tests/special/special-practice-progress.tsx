"use client";

import { useEffect, useState } from "react";

type StoredPracticeState = {
  answers?: unknown;
  answerStates?: unknown;
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
  questionIds,
  sectionId,
  toneIndex
}: {
  questionIds: string[];
  sectionId: string;
  toneIndex: number;
}) {
  const [progress, setProgress] = useState(() => readPracticeProgress(sectionId, questionIds));
  const tone = tones[toneIndex % tones.length];
  const percent = progress.total > 0 ? Math.min(100, Math.round((progress.attempted / progress.total) * 100)) : 0;
  const label = `已答 ${progress.attempted}/${progress.total}`;

  useEffect(() => {
    function refresh() {
      setProgress(readPracticeProgress(sectionId, questionIds));
    }

    refresh();
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, [questionIds, sectionId]);

  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className={`h-3 min-w-32 flex-1 overflow-hidden rounded-full ${tone.track}`}>
        <div className={`h-full rounded-full transition-all ${tone.fill}`} style={{ width: `${percent}%` }} />
      </div>
      <span className="w-20 shrink-0 text-right text-xs font-semibold text-slate-500">{label}</span>
    </div>
  );
}

function readPracticeProgress(sectionId: string, questionIds: string[]) {
  const currentQuestionIds = new Set(questionIds);
  const fallback = { attempted: 0, total: currentQuestionIds.size };

  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(`vibe-special-practice:${sectionId}`);
    if (!raw) {
      return fallback;
    }

    const stored = JSON.parse(raw) as StoredPracticeState;
    const attemptedIds = new Set<string>();

    collectAttemptedIds(stored.answerStates, attemptedIds);
    collectAttemptedIds(stored.answers, attemptedIds);

    return {
      attempted: Array.from(attemptedIds).filter((questionId) => currentQuestionIds.has(questionId)).length,
      total: currentQuestionIds.size
    };
  } catch {
    return fallback;
  }
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
