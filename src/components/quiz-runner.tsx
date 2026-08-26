"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Heart, Loader2, X, XCircle } from "lucide-react";
import { ShareToBuddyButton, type ShareCopySuggestion } from "@/components/share-to-buddy-button";
import type { BuddyShareCard } from "@/lib/buddy-share-cards";
import { getQuestionBankTypeLabel, isQuestionBankRichAnswerQuestionType, type QuestionBankEditableQuestionType } from "@/lib/question-bank-types";
import { cn } from "@/lib/utils";

type Question = {
  id: string;
  type: QuestionBankEditableQuestionType;
  stem: string;
  options: unknown;
  source: string;
  questionBank?: {
    id: string;
    title: string;
    year: number | null;
    paperType: string;
  } | null;
};

type Option = {
  key: string;
  text: string;
};

type CheckState = "idle" | "correct" | "wrong";

type RecordedAttempt = {
  id: string;
  selectedAnswer: unknown;
  isCorrect: boolean;
  correctAnswer: unknown;
};

const text = {
  empty: "\u8fd9\u4e2a\u77e5\u8bc6\u70b9\u8fd8\u6ca1\u6709\u53d1\u5e03\u9898\u76ee\uff0c\u8bf7\u5148\u5728\u540e\u53f0\u5f55\u5165\u9898\u76ee\u3002",
  loading: "\u9898\u76ee\u52a0\u8f7d\u4e2d...",
  loadFailed: "\u9898\u76ee\u52a0\u8f7d\u5931\u8d25\uff0c\u8bf7\u8fd4\u56de\u5b66\u4e60\u9875\u91cd\u8bd5\u3002",
  exit: "\u9000\u51fa\u7ec3\u4e60",
  exitConfirm: "\u786e\u8ba4\u9000\u51fa\u672c\u6b21\u7ec3\u4e60\uff1f",
  question: "\u9898",
  previous: "\u4e0a\u4e00\u9898",
  skip: "\u8df3\u8fc7",
  check: "\u68c0\u67e5",
  done: "\u5b8c\u6210",
  continue: "\u7ee7\u7eed",
  correct: "\u7b54\u5bf9\u4e86\uff01",
  wrong: "\u8fd9\u9898\u7b54\u9519\u4e86",
  rightAnswer: "\u6b63\u786e\u7b54\u6848\uff1a",
  referenceAnswer: "\u53c2\u8003\u7b54\u6848",
  viewReferenceAnswer: "\u8bf7\u5728\u4e0a\u65b9\u67e5\u770b\u53c2\u8003\u7b54\u6848",
  source: "\u9898\u5e93\uff1a"
};

const quizActionButtonClass =
  "inline-flex min-h-12 w-36 items-center justify-center gap-2 rounded-xl border-b-4 border-success-strong bg-success px-5 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-400";

function coerceOptions(options: unknown): Option[] {
  if (Array.isArray(options)) {
    return options
      .map((item) => {
        if (typeof item === "object" && item && "key" in item && "text" in item) {
          return { key: String(item.key), text: String(item.text) };
        }
        return null;
      })
      .filter(Boolean) as Option[];
  }
  return [];
}

function normalizeAnswer(value: unknown) {
  const array = Array.isArray(value) ? value : [value];
  return array
    .map((item) => String(item).trim())
    .filter(Boolean)
    .sort();
}

function answerText(answer: unknown) {
  return normalizeAnswer(answer).join("\u3001");
}

const richTextHtmlPattern = /<\/?[a-z][\s\S]*>/i;

function RichTextContent({ className, value }: { className?: string; value: string }) {
  if (!richTextHtmlPattern.test(value)) {
    return <p className={cn("whitespace-pre-wrap", className)}>{value}</p>;
  }
  return (
    <div
      className={cn(
        "overflow-x-auto break-words [&_div]:my-1 [&_img]:my-2 [&_img]:h-auto [&_img]:max-w-full [&_li]:my-0.5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1 [&_table]:my-2 [&_table]:max-w-full [&_table]:border-collapse [&_td]:border [&_td]:border-current [&_td]:p-2 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5",
        className
      )}
      dangerouslySetInnerHTML={{ __html: value }}
    />
  );
}

export function QuizRunner({
  initialCorrectCount = 0,
  initialIndex = 0,
  initialRecordedAttempts = {},
  initialTotal,
  sectionId,
  sessionId
}: {
  initialCorrectCount?: number;
  initialIndex?: number;
  initialRecordedAttempts?: Record<string, string>;
  initialTotal: number;
  sectionId: string;
  sessionId: string;
}) {
  const router = useRouter();
  const richAnswerFeedbackRef = useRef<HTMLElement | null>(null);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [current, setCurrent] = useState<Question | null>(null);
  const [totalQuestions, setTotalQuestions] = useState(initialTotal);
  const [correctCount, setCorrectCount] = useState(initialCorrectCount);
  const [checkedQuestionIds, setCheckedQuestionIds] = useState<Set<string>>(() => new Set(Object.keys(initialRecordedAttempts)));
  const [recordedAttempts, setRecordedAttempts] = useState<Record<string, string>>(initialRecordedAttempts);
  const [correctAnswer, setCorrectAnswer] = useState<unknown>(null);
  const [checkState, setCheckState] = useState<CheckState>("idle");
  const [questionLoading, setQuestionLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [completionResultPath, setCompletionResultPath] = useState<string | null>(null);
  const [pendingRichAnswerScrollQuestionId, setPendingRichAnswerScrollQuestionId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadQuestion() {
      setQuestionLoading(true);
      setLoadError(false);
      setCheckState("idle");
      setCorrectAnswer(null);

      try {
        const response = await fetch(`/api/learning/sections/${encodeURIComponent(sectionId)}/questions?index=${currentIndex}&sessionId=${encodeURIComponent(sessionId)}`, {
          cache: "no-store"
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error?.message || text.loadFailed);
        }
        if (cancelled) {
          return;
        }
        const question = payload.data.question as Question;
        const recordedAttempt = (payload.data.attempt || null) as RecordedAttempt | null;
        setCurrent(question);
        setTotalQuestions(payload.data.total || initialTotal);
        if (recordedAttempt) {
          setAnswers((currentAnswers) => ({
            ...currentAnswers,
            [question.id]: normalizeAnswer(recordedAttempt.selectedAnswer)
          }));
          setRecordedAttempts((value) => ({ ...value, [question.id]: recordedAttempt.id }));
          setCheckedQuestionIds((value) => new Set(value).add(question.id));
          setCorrectAnswer(recordedAttempt.correctAnswer);
          setCheckState(recordedAttempt.isCorrect ? "correct" : "wrong");
        }
      } catch {
        if (!cancelled) {
          setCurrent(null);
          setLoadError(true);
        }
      } finally {
        if (!cancelled) {
          setQuestionLoading(false);
        }
      }
    }

    void loadQuestion();
    return () => {
      cancelled = true;
    };
  }, [currentIndex, initialTotal, sectionId, sessionId]);

  const isRichAnswerQuestion = Boolean(current && isQuestionBankRichAnswerQuestionType(current.type));

  useEffect(() => {
    if (!pendingRichAnswerScrollQuestionId || pendingRichAnswerScrollQuestionId !== current?.id || checkState === "idle") {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      richAnswerFeedbackRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      setPendingRichAnswerScrollQuestionId(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [checkState, current?.id, pendingRichAnswerScrollQuestionId]);

  const selected = current ? answers[current.id] || [] : [];
  const progressPercent = totalQuestions
    ? Math.max(0, Math.min(100, Math.round((correctCount / totalQuestions) * 100)))
    : 0;
  const canCheck = Boolean(current && selected.length > 0 && checkState === "idle" && !checking && !questionLoading);
  const canGoPrevious = currentIndex > 0 && !checking && !loading && !questionLoading;
  const isLast = currentIndex >= totalQuestions - 1;

  const options = useMemo(() => coerceOptions(current?.options), [current]);
  const questionTypeLabel = current ? questionTypeText(current.type) : "";
  const sourceTitle = current?.questionBank?.title || current?.source || "";
  const questionShareCard = current && checkState !== "idle"
    ? buildQuestionShareCard({
        correctAnswer,
        currentIndex,
        options,
        questionTypeLabel,
        selected,
        sourceTitle,
        stem: current.stem,
        totalQuestions,
        wasCorrect: checkState === "correct"
      })
    : undefined;
  const questionShareContent = checkState === "correct"
    ? "这道题我做对了，考点挺典型。"
    : "这道题我想听听大家怎么理解。";
  const questionShareSuggestions = getQuestionShareSuggestions(checkState);

  function toggleAnswer(question: Question, key: string) {
    if (checkState !== "idle") {
      return;
    }
    setAnswers((currentAnswers) => {
      const previous = currentAnswers[question.id] || [];
      if (question.type === "multiple_choice") {
        const next = previous.includes(key) ? previous.filter((item) => item !== key) : [...previous, key];
        return { ...currentAnswers, [question.id]: next };
      }
      return { ...currentAnswers, [question.id]: [key] };
    });
  }

  function updateTextAnswer(question: Question, value: string) {
    if (checkState !== "idle") {
      return;
    }
    setAnswers((currentAnswers) => ({ ...currentAnswers, [question.id]: value.trim() ? [value] : [] }));
  }

  async function checkAnswer() {
    if (!current || !canCheck) {
      return;
    }

    setChecking(true);
    try {
      const response = await fetch(`/api/learning/sections/${encodeURIComponent(sectionId)}/questions/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: current.id, answer: selected, sessionId })
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error?.message || text.loadFailed);
      }

      const correct = Boolean(payload.data.correct);
      setCorrectAnswer(payload.data.correctAnswer);
      setCheckState(correct ? "correct" : "wrong");
      if (isQuestionBankRichAnswerQuestionType(current.type)) {
        setPendingRichAnswerScrollQuestionId(current.id);
      }
      if (typeof payload.data.attemptId === "string") {
        setRecordedAttempts((value) => ({ ...value, [current.id]: payload.data.attemptId }));
      }
      if (typeof payload.data.resultPath === "string") {
        setCompletionResultPath(payload.data.resultPath);
      }
      if (correct && !checkedQuestionIds.has(current.id)) {
        setCorrectCount((value) => value + 1);
      }
      setCheckedQuestionIds((value) => new Set(value).add(current.id));
    } catch {
      setLoadError(true);
    } finally {
      setChecking(false);
    }
  }

  async function finish() {
    setLoading(true);
    const response = await fetch("/api/progress/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sectionId, answers, recordedAttempts, sessionId })
    });
    const payload = await response.json();
    const resultPath = payload.data?.resultPath || payload.resultPath;
    if (resultPath) {
      router.push(resultPath);
      return;
    }
    setLoading(false);
  }

  function nextQuestion() {
    if (completionResultPath) {
      router.push(completionResultPath);
      return;
    }
    if (isLast) {
      void finish();
      return;
    }
    setCurrentIndex((value) => value + 1);
  }

  function previousQuestion() {
    if (!canGoPrevious) {
      return;
    }
    setCurrentIndex((value) => Math.max(0, value - 1));
  }

  function skipQuestion() {
    if (isLast) {
      void finish();
      return;
    }
    setCurrentIndex((value) => value + 1);
  }

  if (questionLoading && !current) {
    return <div className="mx-auto mt-10 max-w-3xl text-slate-600">{text.loading}</div>;
  }

  if (loadError) {
    return <div className="mx-auto mt-10 max-w-3xl text-slate-600">{text.loadFailed}</div>;
  }

  if (totalQuestions === 0 || !current) {
    return <div className="mx-auto mt-10 max-w-3xl text-slate-600">{text.empty}</div>;
  }

  return (
    <section className="flex h-dvh flex-col overflow-hidden bg-surface">
      <div className="mx-auto flex w-full max-w-5xl items-center gap-5 px-5 py-6">
        <button
          className="grid size-11 shrink-0 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/20"
          type="button"
          aria-label={text.exit}
          onClick={() => {
            if (window.confirm(text.exitConfirm)) {
              router.push("/learn");
            }
          }}
        >
          <X size={22} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="h-4 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-success transition-all" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-sm font-semibold text-coral">
          <Heart className="fill-coral" size={22} />
          {correctCount}/{totalQuestions}
        </div>
      </div>

      <article
        className={cn(
          "mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-y-auto px-5 py-5",
          isRichAnswerQuestion && checkState !== "idle" ? "justify-start" : "justify-center"
        )}
      >
        <p className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm font-semibold text-teal">
          <span>{text.question} {currentIndex + 1} / {totalQuestions} · {questionTypeLabel}</span>
          {sourceTitle ? (
            <span className="max-w-full truncate rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500" title={sourceTitle}>
              {text.source}{sourceTitle}
            </span>
          ) : null}
        </p>
        <h3 className="mt-3 text-xl font-semibold leading-snug text-ink">{current.stem}</h3>

        {current.type === "fill_blank" || isQuestionBankRichAnswerQuestionType(current.type) ? (
          <div className="mt-6">
            {current.type === "fill_blank" ? (
              <input
                aria-label="请输入答案"
                autoComplete="off"
                className={cn(
                  "min-h-14 w-full rounded-xl border-2 bg-surface px-5 py-3 text-base font-bold outline-none transition placeholder:font-medium placeholder:text-slate-400",
                  checkState === "correct"
                    ? "border-success bg-success-muted"
                    : checkState === "wrong"
                      ? "border-coral bg-coral/10"
                      : "border-border-soft focus:border-info focus:ring-4 focus:ring-info/10"
                )}
                disabled={checkState !== "idle"}
                placeholder="请输入答案"
                type="text"
                value={selected[0] || ""}
                onChange={(event) => updateTextAnswer(current, event.target.value)}
              />
            ) : (
              <textarea
                aria-label="请输入你的作答"
                className={cn(
                  "min-h-36 w-full resize-y rounded-xl border-2 bg-surface px-5 py-4 text-base font-medium leading-7 outline-none transition placeholder:text-slate-400",
                  checkState === "correct"
                    ? "border-success bg-success-muted"
                    : checkState === "wrong"
                      ? "border-coral bg-coral/10"
                      : "border-border-soft focus:border-info focus:ring-4 focus:ring-info/10"
                )}
                disabled={checkState !== "idle"}
                placeholder="请输入你的作答"
                rows={6}
                value={selected[0] || ""}
                onChange={(event) => updateTextAnswer(current, event.target.value)}
              />
            )}
          </div>
        ) : (
          <div className="mt-6 grid gap-3">
            {options.map((option) => {
              const active = selected.includes(option.key);
              const correctOption = checkState !== "idle" && normalizeAnswer(correctAnswer).includes(option.key);
              return (
                <button
                  key={option.key}
                  className={cn(
                    "min-h-14 rounded-xl border-2 px-5 py-3 text-left text-base font-bold transition",
                    correctOption
                      ? "border-success bg-success-muted text-ink"
                      : checkState === "wrong" && active
                        ? "border-coral bg-coral/10 text-coral"
                        : active
                          ? "border-info bg-info-muted text-ink"
                          : "border-border-soft bg-surface hover:border-slate-300"
                  )}
                  type="button"
                  disabled={checkState !== "idle"}
                  onClick={() => toggleAnswer(current, option.key)}
                >
                  <span className="mr-2 text-slate-400">{option.key}.</span> {option.text}
                </button>
              );
            })}
          </div>
        )}

        {isRichAnswerQuestion && checkState !== "idle" ? (
          <section
            ref={richAnswerFeedbackRef}
            aria-labelledby={`reference-answer-${current.id}`}
            className="mt-5 rounded-2xl border border-teal/20 bg-teal/5 p-5 text-ink"
          >
            <h4 id={`reference-answer-${current.id}`} className="text-base font-semibold text-teal">
              {text.referenceAnswer}
            </h4>
            <RichTextContent className="mt-3 text-base leading-8" value={answerText(correctAnswer) || "\u6682\u65e0\u53c2\u8003\u7b54\u6848"} />
          </section>
        ) : null}
      </article>

      <div
        className={cn(
          "border-t border-border-soft px-5 py-4",
          checkState === "correct" ? "bg-success-muted" : checkState === "wrong" ? "bg-coral/10" : "bg-surface"
        )}
      >
        <div className="mx-auto flex min-h-16 w-full max-w-5xl flex-wrap items-center justify-between gap-4">
          {checkState === "idle" ? (
            <div className="flex flex-wrap items-center gap-2">
              <button className="secondary-button" type="button" disabled={!canGoPrevious} onClick={previousQuestion}>
                {text.previous}
              </button>
              <button className="secondary-button" type="button" disabled={loading || checking || questionLoading} onClick={skipQuestion}>
                {text.skip}
              </button>
            </div>
          ) : (
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <button className="secondary-button" type="button" disabled={!canGoPrevious} onClick={previousQuestion}>
                {text.previous}
              </button>
              <div className={cn("flex min-w-0 items-center gap-3", checkState === "correct" ? "text-success-strong" : "text-coral")}>
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-surface">
                  {checkState === "correct" ? <CheckCircle2 size={26} /> : <XCircle size={26} />}
                </span>
                <div className="min-w-0">
                  <p className="text-lg font-semibold">{checkState === "correct" ? text.correct : text.wrong}</p>
                  {checkState === "wrong" ? (
                    <p className={cn("text-sm font-semibold", !isRichAnswerQuestion && "truncate")}>
                      {isRichAnswerQuestion ? text.viewReferenceAnswer : `${text.rightAnswer}${answerText(correctAnswer)}`}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          )}

          <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
            {checkState !== "idle" ? (
              <ShareToBuddyButton
                buttonClassName="min-h-12 rounded-xl border-surface bg-surface px-4 shadow-sm hover:border-surface"
                buttonLabel="分享"
                contentSuggestions={questionShareSuggestions}
                copyContext={checkState === "correct" ? "question_correct" : "question_wrong"}
                defaultContent={questionShareContent}
                shareCard={questionShareCard}
                sourceLabel={`题 ${currentIndex + 1} / ${totalQuestions}`}
              />
            ) : null}

            {checkState === "idle" ? (
              <button
                className={quizActionButtonClass}
                type="button"
                disabled={!canCheck}
                onClick={checkAnswer}
              >
                {checking ? <Loader2 className="animate-spin" size={18} /> : null}
                {text.check}
              </button>
            ) : (
              <button
                className={quizActionButtonClass}
                type="button"
                disabled={loading}
                onClick={nextQuestion}
              >
                {loading ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
                {isLast || completionResultPath ? text.done : text.continue}
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function questionTypeText(type: Question["type"]) {
  return getQuestionBankTypeLabel(type);
}

function buildQuestionShareCard({
  correctAnswer,
  currentIndex,
  options,
  questionTypeLabel,
  selected,
  sourceTitle,
  stem,
  totalQuestions,
  wasCorrect
}: {
  correctAnswer: unknown;
  currentIndex: number;
  options: Option[];
  questionTypeLabel: string;
  selected: string[];
  sourceTitle: string;
  stem: string;
  totalQuestions: number;
  wasCorrect: boolean;
}): BuddyShareCard {
  const selectedText = selected.length > 0 ? answerDetailText(selected, options) : "未选择";
  return {
    type: "question_card",
    correctAnswer: answerDetailText(correctAnswer, options) || "未记录",
    indexLabel: `题 ${currentIndex + 1}/${totalQuestions}`,
    questionTypeLabel,
    selectedAnswer: selectedText,
    sourceTitle: sourceTitle ? clipShareText(sourceTitle, 42) : undefined,
    title: clipShareText(stem, 92),
    wasCorrect
  };
}

function answerDetailText(answer: unknown, options: Option[]) {
  const optionTextByKey = new Map(options.map((option) => [option.key, option.text]));
  return normalizeAnswer(answer)
    .map((item) => {
      const optionText = optionTextByKey.get(item);
      return optionText || item;
    })
    .join("；");
}

function getQuestionShareSuggestions(checkState: CheckState): ShareCopySuggestion[] {
  if (checkState === "correct") {
    return [
      { label: "考点典型", content: "这道题我做对了，考点挺典型。" },
      { label: "高频收藏", content: "刷到一道高频感很强的题，分享给大家一起记。" },
      { label: "复习提醒", content: "这个知识点容易混，顺手做个复习标记。" }
    ];
  }
  if (checkState === "wrong") {
    return [
      { label: "求助讨论", content: "这道题我想听听大家怎么理解。" },
      { label: "错题复盘", content: "这题踩坑了，先发出来做个错题复盘。" },
      { label: "想听思路", content: "我的思路可能偏了，有没有同学讲讲这题怎么想？" }
    ];
  }
  return [];
}

function clipShareText(value: string, maxLength: number) {
  const textValue = value.replace(/\s+/g, " ").trim();
  return textValue.length > maxLength ? `${textValue.slice(0, maxLength)}...` : textValue;
}
