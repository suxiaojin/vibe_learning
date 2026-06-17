"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Bot, ChevronDown, ChevronLeft, ChevronRight, ClipboardList, Flag, Share2, Star } from "lucide-react";
import { getQuestionBankTypeLabel } from "@/lib/question-bank-types";

type PracticeQuestion = {
  id: string;
  type: string;
  stem: string;
  options: unknown;
  answer: unknown;
  analysis: string;
};

type PracticeOption = {
  key: string;
  text: string;
};

type AnswerState = "unanswered" | "correct" | "wrong";

type StoredPracticeState = {
  questionIdsSignature?: string;
  currentIndex?: number;
  answers?: unknown;
  answerStates?: unknown;
  revealedQuestionIds?: unknown;
};

type HydratedPracticeState = {
  currentIndex: number;
  answers: Record<string, string[]>;
  answerStates: Record<string, AnswerState>;
  revealedQuestionIds: Record<string, boolean>;
};

export function SpecialPracticeRunner({
  initialIndex,
  questions,
  sectionId,
  sectionTitle
}: {
  initialIndex: number;
  questions: PracticeQuestion[];
  sectionId: string;
  sectionTitle: string;
}) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [answerStates, setAnswerStates] = useState<Record<string, AnswerState>>({});
  const [revealedQuestionIds, setRevealedQuestionIds] = useState<Record<string, boolean>>({});
  const [hydrated, setHydrated] = useState(false);
  const question = questions[currentIndex];
  const selected = answers[question.id] || [];
  const revealed = Boolean(revealedQuestionIds[question.id]);
  const judgedState = answerStates[question.id];
  const options = useMemo(() => normalizeOptions(question.options), [question.options]);
  const correctAnswer = normalizeAnswer(question.answer);
  const previousEnabled = currentIndex > 0;
  const isLastQuestion = currentIndex === questions.length - 1;
  const questionIds = useMemo(() => questions.map((item) => item.id), [questions]);
  const questionIdsSignature = useMemo(() => questionIds.join("|"), [questionIds]);
  const storageKey = useMemo(() => `vibe-special-practice:${sectionId}`, [sectionId]);

  useEffect(() => {
    try {
      const stored = readStoredPracticeState(storageKey, questionIds, questionIdsSignature, initialIndex);
      if (stored) {
        setAnswers(stored.answers);
        setAnswerStates(stored.answerStates);
        setRevealedQuestionIds(stored.revealedQuestionIds);
        setCurrentIndex(stored.currentIndex);
      } else {
        setCurrentIndex(initialIndex);
      }
    } finally {
      setHydrated(true);
    }
  }, [initialIndex, questionIds, questionIdsSignature, storageKey]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({
          questionIdsSignature,
          currentIndex,
          answers,
          answerStates,
          revealedQuestionIds
        })
      );
    } catch {
      // Local practice progress is a convenience cache; blocked storage should not break answering.
    }
  }, [answerStates, answers, currentIndex, hydrated, questionIdsSignature, revealedQuestionIds, storageKey]);

  function selectOption(optionKey: string) {
    if (revealed || judgedState) {
      return;
    }

    setAnswers((current) => {
      const previous = current[question.id] || [];
      if (question.type === "multiple_choice") {
        const next = previous.includes(optionKey) ? previous.filter((item) => item !== optionKey) : [...previous, optionKey];
        return { ...current, [question.id]: next };
      }
      return { ...current, [question.id]: [optionKey] };
    });
  }

  function toggleAnswer() {
    if (!revealed) {
      judgeCurrentQuestion({ markUnansweredWrong: true });
    }
    setRevealedQuestionIds((current) => ({ ...current, [question.id]: !current[question.id] }));
  }

  function judgeCurrentQuestion({ markUnansweredWrong }: { markUnansweredWrong: boolean }) {
    if (answerStates[question.id]) {
      return;
    }
    if (selected.length === 0 && !markUnansweredWrong) {
      return;
    }

    const status = isAnswerCorrect(selected, correctAnswer) ? "correct" : "wrong";
    setAnswerStates((current) => (current[question.id] ? current : { ...current, [question.id]: status }));
  }

  function goToPreviousQuestion() {
    if (!previousEnabled) {
      return;
    }
    judgeCurrentQuestion({ markUnansweredWrong: false });
    setCurrentIndex((value) => value - 1);
  }

  function goToQuestion(index: number) {
    if (index !== currentIndex) {
      judgeCurrentQuestion({ markUnansweredWrong: false });
    }
    setCurrentIndex(index);
  }

  function goToNextQuestion() {
    if (isLastQuestion) {
      judgeCurrentQuestion({ markUnansweredWrong: true });
      return;
    }
    judgeCurrentQuestion({ markUnansweredWrong: false });
    setCurrentIndex((value) => value + 1);
  }

  return (
    <main className="min-h-dvh bg-[#f2f3f7]">
      <div className="grid min-h-dvh gap-8 px-5 py-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="flex min-h-[calc(100dvh-48px)] flex-col overflow-hidden rounded-t-2xl border border-[#f3c892] bg-[#fff4e4]">
          <header className="grid min-h-20 place-items-center px-5 text-center">
            <h1 className="text-2xl font-black text-black">【专项练习】 {sectionTitle}</h1>
          </header>

          <article className="min-h-0 flex-1 overflow-y-auto rounded-t-2xl bg-white px-7 py-8">
            <span className="inline-flex rounded-lg bg-[#eef3fb] px-2.5 py-1.5 text-base font-medium text-[#1f2937]">
              {formatQuestionType(question.type)}
            </span>
            <h2 className="mt-6 text-xl font-medium leading-9 text-black">
              {currentIndex + 1}、{question.stem}
            </h2>

            {options.length > 0 ? (
              <div className="mt-6 grid max-w-3xl gap-5">
                {options.map((option) => {
                  const selectedOption = selected.includes(option.key);
                  const correctOption =
                    (revealed && correctAnswer.includes(option.key)) ||
                    (Boolean(judgedState) && selectedOption && correctAnswer.includes(option.key));
                  const wrongOption = (revealed || Boolean(judgedState)) && selectedOption && !correctAnswer.includes(option.key);

                  return (
                    <button
                      key={`${question.id}-${option.key || option.text}`}
                      className="flex cursor-pointer items-start gap-3 text-left text-xl leading-8 text-black"
                      type="button"
                      onClick={() => selectOption(option.key)}
                    >
                      <span className={optionBadgeClassName({ correctOption, selectedOption, wrongOption })}>{option.key}</span>
                      <span className="min-w-0 flex-1">{option.text}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="mt-6 max-w-3xl rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-base font-semibold text-slate-500">
                这道题暂无可展示选项，后续答题功能会按题型处理。
              </div>
            )}

            <div className="mt-8 flex flex-wrap items-center gap-8">
              <button className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#c9b7ff] bg-[#eee7ff] px-4 text-base font-medium text-[#715aff]" type="button">
                <Bot size={19} />
                AI答疑
              </button>
              <div className="hidden h-px flex-1 border-t border-dashed border-slate-200 md:block" />
              <IconTextButton icon={<Share2 size={24} />} label="分享" />
              <IconTextButton icon={<Flag size={24} />} label="纠错" />
              <IconTextButton icon={<Star size={25} />} label="收藏" />
            </div>

            {revealed ? (
              <section className="mt-4 max-w-3xl rounded-lg bg-slate-50 px-5 py-5 text-sm leading-7 text-black">
                <p>
                  <span className="font-black">参考答案：</span>
                  <span className="ml-2 font-black text-[#21c7bd]">{answerText(correctAnswer) || "暂无"}</span>
                </p>
                <p className="mt-3">
                  <span className="font-black">文字解析：</span>
                  <span className="text-[#475569]">{question.analysis || "暂无解析。"}</span>
                </p>
              </section>
            ) : null}
          </article>

          <footer className="grid min-h-16 grid-cols-3 items-center border-t border-slate-200 bg-white px-7 text-lg">
            <button
              className={previousEnabled ? "inline-flex items-center gap-1 text-slate-600 transition hover:text-[#ef233c]" : "inline-flex cursor-not-allowed items-center gap-1 text-slate-300"}
              disabled={!previousEnabled}
              type="button"
              onClick={goToPreviousQuestion}
            >
              <ChevronLeft size={22} />
              上一题
            </button>
            <button className="justify-self-center inline-flex items-center gap-1 text-black" type="button" onClick={toggleAnswer}>
              {revealed ? "收起答案/解析" : "查看答案/解析"}
              <ChevronDown className={revealed ? "rotate-180 transition" : "transition"} size={20} />
            </button>
            <button
              className="justify-self-end inline-flex items-center gap-1 text-black transition hover:text-[#ef233c]"
              type="button"
              onClick={goToNextQuestion}
            >
              {isLastQuestion ? "完成" : "下一题"}
              {isLastQuestion ? null : <ChevronRight size={22} />}
            </button>
          </footer>
        </section>

        <AnswerCard
          answerStates={answerStates}
          currentIndex={currentIndex}
          questions={questions}
          setCurrentIndex={goToQuestion}
        />
      </div>
    </main>
  );
}

function AnswerCard({
  answerStates,
  currentIndex,
  questions,
  setCurrentIndex
}: {
  answerStates: Record<string, AnswerState>;
  currentIndex: number;
  questions: PracticeQuestion[];
  setCurrentIndex: (index: number) => void;
}) {
  const visibleQuestions = questions.slice(0, 50);

  return (
    <aside className="self-start rounded-2xl bg-white px-5 py-7 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ClipboardList className="text-[#21c7bd]" size={30} />
          <h2 className="text-2xl font-medium text-black">答题卡</h2>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-5 gap-4">
        {visibleQuestions.map((question, index) => {
          const state = answerStates[question.id] || "unanswered";
          return (
            <button
              key={question.id}
              className={answerCardButtonClassName({ active: index === currentIndex, state })}
              type="button"
              onClick={() => setCurrentIndex(index)}
            >
              {index + 1}
            </button>
          );
        })}
      </div>

      <div className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-black">
        <LegendDot className="bg-[#22c55e]" label="正确" />
        <LegendDot className="bg-[#ef233c]" label="错误" />
        <LegendDot className="bg-[#d1d5db]" label="未答" />
      </div>
    </aside>
  );
}

function readStoredPracticeState(
  storageKey: string,
  questionIds: string[],
  questionIdsSignature: string,
  fallbackIndex: number
): HydratedPracticeState | null {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return null;
    }

    const stored = JSON.parse(raw) as StoredPracticeState;
    if (stored.questionIdsSignature !== questionIdsSignature) {
      return null;
    }

    const answers = sanitizeStoredAnswers(stored.answers, questionIds);
    const answerStates = sanitizeStoredAnswerStates(stored.answerStates, questionIds);
    const revealedQuestionIds = sanitizeStoredRevealState(stored.revealedQuestionIds, questionIds);

    return {
      currentIndex: resolveResumeIndex({
        answers,
        answerStates,
        fallbackIndex,
        questionIds,
        storedIndex: stored.currentIndex
      }),
      answers,
      answerStates,
      revealedQuestionIds
    };
  } catch {
    return null;
  }
}

function sanitizeStoredAnswers(value: unknown, questionIds: string[]) {
  const allowedIds = new Set(questionIds);
  const result: Record<string, string[]> = {};

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return result;
  }

  for (const [questionId, answer] of Object.entries(value as Record<string, unknown>)) {
    if (!allowedIds.has(questionId) || !Array.isArray(answer)) {
      continue;
    }

    const normalizedAnswer = answer.map((item) => String(item).trim()).filter(Boolean);
    if (normalizedAnswer.length > 0) {
      result[questionId] = normalizedAnswer;
    }
  }

  return result;
}

function sanitizeStoredAnswerStates(value: unknown, questionIds: string[]) {
  const allowedIds = new Set(questionIds);
  const result: Record<string, AnswerState> = {};

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return result;
  }

  for (const [questionId, state] of Object.entries(value as Record<string, unknown>)) {
    if (!allowedIds.has(questionId)) {
      continue;
    }
    if (state === "correct" || state === "wrong") {
      result[questionId] = state;
    }
  }

  return result;
}

function sanitizeStoredRevealState(value: unknown, questionIds: string[]) {
  const allowedIds = new Set(questionIds);
  const result: Record<string, boolean> = {};

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return result;
  }

  for (const [questionId, revealed] of Object.entries(value as Record<string, unknown>)) {
    if (allowedIds.has(questionId) && revealed === true) {
      result[questionId] = true;
    }
  }

  return result;
}

function resolveResumeIndex({
  answers,
  answerStates,
  fallbackIndex,
  questionIds,
  storedIndex
}: {
  answers: Record<string, string[]>;
  answerStates: Record<string, AnswerState>;
  fallbackIndex: number;
  questionIds: string[];
  storedIndex: number | undefined;
}) {
  const clampedStoredIndex = clampQuestionIndex(storedIndex, questionIds.length, fallbackIndex);
  const storedQuestionId = questionIds[clampedStoredIndex];
  if (storedQuestionId && !hasAttemptedQuestion(storedQuestionId, answers, answerStates)) {
    return clampedStoredIndex;
  }

  const firstUnansweredIndex = questionIds.findIndex((questionId) => !hasAttemptedQuestion(questionId, answers, answerStates));
  return firstUnansweredIndex >= 0 ? firstUnansweredIndex : clampedStoredIndex;
}

function hasAttemptedQuestion(questionId: string, answers: Record<string, string[]>, answerStates: Record<string, AnswerState>) {
  return Boolean(answerStates[questionId]) || (answers[questionId]?.length || 0) > 0;
}

function clampQuestionIndex(value: number | undefined, total: number, fallbackIndex: number) {
  const fallback = Number.isFinite(fallbackIndex) ? fallbackIndex : 0;
  const parsed = Number.isFinite(value) ? Number(value) : fallback;
  return Math.min(Math.max(Math.trunc(parsed), 0), Math.max(total - 1, 0));
}

function IconTextButton({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <button className="inline-flex items-center gap-2 text-lg font-medium text-[#666] transition hover:text-[#ef233c]" type="button">
      {icon}
      {label}
    </button>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`size-4 rounded-full ${className}`} />
      {label}
    </span>
  );
}

function normalizeOptions(options: unknown): PracticeOption[] {
  if (!Array.isArray(options)) {
    return [];
  }

  return options
    .map((option) => {
      if (!option || typeof option !== "object") {
        return null;
      }
      const value = option as { key?: unknown; text?: unknown };
      return {
        key: String(value.key || "").trim(),
        text: String(value.text || "").trim()
      };
    })
    .filter((option): option is PracticeOption => Boolean(option?.key || option?.text));
}

function normalizeAnswer(value: unknown) {
  const array = Array.isArray(value) ? value : [value];
  return array
    .map((item) => String(item).trim())
    .filter(Boolean)
    .sort();
}

function answerText(answer: string[]) {
  return answer.join("、");
}

function isAnswerCorrect(selected: string[], correctAnswer: string[]) {
  if (selected.length === 0) {
    return false;
  }
  return JSON.stringify([...selected].sort()) === JSON.stringify(correctAnswer);
}

function optionBadgeClassName({
  correctOption,
  selectedOption,
  wrongOption
}: {
  correctOption: boolean;
  selectedOption: boolean;
  wrongOption: boolean;
}) {
  if (correctOption) {
    return "mt-1 grid size-8 shrink-0 place-items-center rounded-full bg-[#22c55e] text-lg font-black text-white";
  }
  if (wrongOption) {
    return "mt-1 grid size-8 shrink-0 place-items-center rounded-full bg-[#ef233c] text-lg font-black text-white";
  }
  if (selectedOption) {
    return "mt-1 grid size-8 shrink-0 place-items-center rounded-full bg-[#21c7bd] text-lg font-black text-white";
  }
  return "mt-1 grid size-8 shrink-0 place-items-center rounded-full bg-[#f1f2f4] text-lg font-black text-[#667085]";
}

function answerCardButtonClassName({ active, state }: { active: boolean; state: AnswerState }) {
  const base = "grid size-10 place-items-center rounded-full text-base font-black transition";
  const activeRing = active ? " ring-2 ring-offset-2 ring-[#21c7bd]" : "";
  if (state === "correct") {
    return `${base} bg-[#22c55e] text-white${activeRing}`;
  }
  if (state === "wrong") {
    return `${base} bg-[#ef233c] text-white${activeRing}`;
  }
  return `${base} bg-[#f3f3f3] text-[#626b78] hover:bg-slate-200${activeRing}`;
}

function formatQuestionType(type: string) {
  const label = getQuestionBankTypeLabel(type);
  return label.endsWith("题") ? label : `${label}题`;
}
