"use client";

import { Star } from "lucide-react";
import { useFormStatus } from "react-dom";
import { updateChapterChallengeDifficulty } from "@/app/admin/question-banks/challenge-actions";

function formatChallengeDifficulty(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function DifficultyRatingControls({ difficultyRating }: { difficultyRating: number | null }) {
  const { pending } = useFormStatus();
  const selectedHalfSteps = difficultyRating === null ? 0 : Math.round(difficultyRating * 2);

  return (
    <fieldset disabled={pending}>
      <legend className="sr-only">设置关卡难度</legend>
      <div className="flex items-center justify-between gap-2 text-[10px] font-bold text-[#92400e]">
        <span>难度</span>
        <span aria-live="polite">
          {pending ? "保存中" : selectedHalfSteps ? `${formatChallengeDifficulty(selectedHalfSteps / 2)} 星` : "未设置"}
        </span>
        {selectedHalfSteps ? (
          <button
            className="rounded px-1 py-0.5 text-[#b45309] hover:bg-[#fef3c7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f59e0b] disabled:cursor-wait disabled:opacity-60"
            name="difficultyRating"
            type="submit"
            value=""
          >
            清空
          </button>
        ) : null}
      </div>
      <div className="mt-0.5 flex items-center" aria-label="关卡难度，支持半星">
        {[1, 2, 3, 4, 5].map((starNumber) => {
          const filledHalfSteps = Math.max(0, Math.min(2, selectedHalfSteps - (starNumber - 1) * 2));
          return (
            <span className="relative block h-8 w-6 shrink-0" key={starNumber}>
              <Star
                aria-hidden="true"
                className="absolute left-0.5 top-1.5 text-[#cbd5e1]"
                size={20}
                strokeWidth={1.8}
              />
              {filledHalfSteps ? (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute left-0.5 top-1.5 h-5 overflow-hidden"
                  style={{ width: `${filledHalfSteps * 10}px` }}
                >
                  <Star className="absolute left-0 top-0 fill-[#fbbf24] text-[#d99b05]" size={20} strokeWidth={1.8} />
                </span>
              ) : null}
              <span className="absolute inset-0 grid grid-cols-2">
                {[starNumber - 0.5, starNumber].map((value) => (
                  <button
                    aria-label={`设置关卡难度为 ${formatChallengeDifficulty(value)} 星`}
                    aria-pressed={selectedHalfSteps === value * 2}
                    className="rounded-sm hover:bg-[#fef3c7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f59e0b] disabled:cursor-wait"
                    key={value}
                    name="difficultyRating"
                    title={`${formatChallengeDifficulty(value)} 星`}
                    type="submit"
                    value={value}
                  />
                ))}
              </span>
            </span>
          );
        })}
      </div>
    </fieldset>
  );
}

export function ChallengeDifficultyRating({
  scopeType,
  scopeId,
  challengeVersionId,
  difficultyRating
}: {
  scopeType: "chapter" | "course";
  scopeId: string;
  challengeVersionId: string;
  difficultyRating: number | null;
}) {
  return (
    <form
      action={updateChapterChallengeDifficulty}
      className="ml-auto min-w-[148px] shrink-0 rounded-md border border-[#f4d06f] bg-[#fffbeb] px-2 py-1.5"
    >
      <input name="scopeType" type="hidden" value={scopeType} />
      <input name="scopeId" type="hidden" value={scopeId} />
      <input name="challengeVersionId" type="hidden" value={challengeVersionId} />
      <DifficultyRatingControls difficultyRating={difficultyRating} />
    </form>
  );
}
