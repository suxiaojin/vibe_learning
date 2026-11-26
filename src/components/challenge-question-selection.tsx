"use client";

import { createContext, useActionState, useContext, useState, type ReactNode } from "react";
import { addSelectedQuestionsToChapterChallenge } from "@/app/sxjvbcontrol/question-banks/challenge-actions";

type ChallengeSelection = {
  scopeType: "chapter" | "course";
  scopeId: string;
  challengeVersionId: string;
  remainingSlots: number;
  eligibleQuestionIds: string[];
};

const ChallengeQuestionSelectionContext = createContext<{
  selectedIds: Set<string>;
  toggleQuestion: (questionId: string) => void;
  headerControls: ReactNode;
} | null>(null);

export function ChallengeQuestionSelectionTable({
  selection,
  children
}: {
  selection: ChallengeSelection | null;
  children: ReactNode;
}) {
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set());
  const [error, formAction, pending] = useActionState(async (_previous: string | null, formData: FormData) => {
    const result = await addSelectedQuestionsToChapterChallenge(formData);
    if (!result) {
      setCheckedIds(new Set());
    }
    return result;
  }, null);
  const eligibleIds = selection?.eligibleQuestionIds ?? [];
  const selectedIds = new Set(eligibleIds.filter((questionId) => checkedIds.has(questionId)));
  const allSelected = eligibleIds.length > 0 && selectedIds.size === eligibleIds.length;
  const exceedsCapacity = selectedIds.size > (selection?.remainingSlots ?? 0);

  function toggleQuestion(questionId: string) {
    setCheckedIds((previous) => {
      const next = new Set(previous);
      if (next.has(questionId)) {
        next.delete(questionId);
      } else {
        next.add(questionId);
      }
      return next;
    });
  }

  const headerControls = selection && (
    <>
      <button
        className="whitespace-nowrap rounded border border-[#cfd8e6] bg-white px-2 py-1 text-xs font-bold text-[#3562ff] hover:bg-[#eff6ff] disabled:opacity-50"
        disabled={eligibleIds.length === 0 || pending}
        onClick={() => setCheckedIds(new Set(allSelected ? [] : eligibleIds))}
        type="button"
      >
        {allSelected ? "取消全选" : "全选未加入"}
      </button>
      {selectedIds.size > 0 && (
        <form action={formAction} className="grid basis-full gap-1 pb-2">
          <input name="scopeType" type="hidden" value={selection.scopeType} />
          <input name="scopeId" type="hidden" value={selection.scopeId} />
          <input name="challengeVersionId" type="hidden" value={selection.challengeVersionId} />
          {!exceedsCapacity && [...selectedIds].map((questionId) => (
            <input key={questionId} name="questionId" type="hidden" value={questionId} />
          ))}
          <button
            className="justify-self-start rounded bg-[#3562ff] px-2 py-1 text-xs font-bold text-white hover:bg-[#2754eb] disabled:opacity-50"
            disabled={exceedsCapacity || pending}
            type="submit"
          >
            {pending ? "正在加入…" : `加入所选题目（${selectedIds.size}）`}
          </button>
          {exceedsCapacity && (
            <p className="font-medium text-[#92400e]" role="status">本关还可加入 {selection.remainingSlots} 道题。</p>
          )}
          {error && <p className="font-medium text-[#b91c1c]" role="alert">{error}</p>}
        </form>
      )}
    </>
  );

  return (
    <ChallengeQuestionSelectionContext.Provider value={{ selectedIds, toggleQuestion, headerControls }}>
      <table className="w-full min-w-[1000px] border-collapse text-left text-sm 2xl:min-w-[1120px]">
        {children}
      </table>
    </ChallengeQuestionSelectionContext.Provider>
  );
}

export function ChallengeQuestionSelectionHeader() {
  const selection = useContext(ChallengeQuestionSelectionContext);
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span>操作</span>
      {selection?.headerControls}
    </div>
  );
}

export function ChallengeQuestionCheckbox({ questionId }: { questionId: string }) {
  const selection = useContext(ChallengeQuestionSelectionContext);
  if (!selection) return null;

  return (
    <input
      aria-label="勾选题目"
      checked={selection.selectedIds.has(questionId)}
      className="size-4 shrink-0 cursor-pointer accent-[#3562ff]"
      onChange={() => selection.toggleQuestion(questionId)}
      type="checkbox"
    />
  );
}
