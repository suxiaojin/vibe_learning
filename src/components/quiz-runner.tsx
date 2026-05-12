"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Heart, Loader2, X, XCircle } from "lucide-react";

type Question = {
  id: string;
  type: "single_choice" | "multiple_choice" | "true_false";
  stem: string;
  options: unknown;
  answer: unknown;
  source: string;
};

type Option = {
  key: string;
  text: string;
};

type CheckState = "idle" | "correct" | "wrong";

const text = {
  empty: "\u8fd9\u4e2a\u77e5\u8bc6\u70b9\u8fd8\u6ca1\u6709\u53d1\u5e03\u9898\u76ee\uff0c\u8bf7\u5148\u5728\u540e\u53f0\u5f55\u5165\u9898\u76ee\u3002",
  exit: "\u9000\u51fa\u7ec3\u4e60",
  question: "\u9898",
  skip: "\u8df3\u8fc7",
  check: "\u68c0\u67e5",
  done: "\u5b8c\u6210",
  continue: "\u7ee7\u7eed",
  correct: "\u7b54\u5bf9\u4e86\uff01",
  wrong: "\u8fd9\u9898\u7b54\u9519\u4e86",
  rightAnswer: "\u6b63\u786e\u7b54\u6848\uff1a"
};

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

function answersEqual(left: unknown, right: unknown) {
  return JSON.stringify(normalizeAnswer(left)) === JSON.stringify(normalizeAnswer(right));
}

function answerText(answer: unknown) {
  return normalizeAnswer(answer).join("\u3001");
}

export function QuizRunner({ pointId, questions }: { pointId: string; questions: Question[] }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [checkedQuestionIds, setCheckedQuestionIds] = useState<Set<string>>(() => new Set());
  const [checkState, setCheckState] = useState<CheckState>("idle");
  const [loading, setLoading] = useState(false);

  const current = questions[currentIndex];
  const selected = current ? answers[current.id] || [] : [];
  const progressPercent = questions.length ? Math.round((correctCount / questions.length) * 100) : 0;
  const canCheck = selected.length > 0 && checkState === "idle";
  const isLast = currentIndex === questions.length - 1;

  const options = useMemo(() => coerceOptions(current?.options), [current]);

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

  function checkAnswer() {
    if (!current || !canCheck) {
      return;
    }
    const correct = answersEqual(selected, current.answer);
    setCheckState(correct ? "correct" : "wrong");
    if (correct && !checkedQuestionIds.has(current.id)) {
      setCorrectCount((value) => value + 1);
    }
    setCheckedQuestionIds((value) => new Set(value).add(current.id));
  }

  async function finish() {
    setLoading(true);
    const response = await fetch("/api/progress/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pointId, answers })
    });
    const payload = await response.json();
    if (payload.resultPath) {
      router.push(payload.resultPath);
      return;
    }
    setLoading(false);
  }

  function nextQuestion() {
    if (isLast) {
      void finish();
      return;
    }
    setCurrentIndex((value) => value + 1);
    setCheckState("idle");
  }

  function skipQuestion() {
    if (isLast) {
      void finish();
      return;
    }
    setCurrentIndex((value) => value + 1);
    setCheckState("idle");
  }

  if (questions.length === 0 || !current) {
    return <div className="mx-auto mt-10 max-w-3xl text-slate-600">{text.empty}</div>;
  }

  return (
    <section className="flex h-dvh flex-col overflow-hidden bg-white">
      <div className="mx-auto flex w-full max-w-5xl items-center gap-5 px-5 py-6">
        <Link className="grid size-10 shrink-0 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600" href="/learn" aria-label={text.exit}>
          <X size={22} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="h-4 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-[#58cc02] transition-all" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-sm font-black text-coral">
          <Heart className="fill-coral" size={22} />
          {correctCount}/{questions.length}
        </div>
      </div>

      <article className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center overflow-y-auto px-5 py-5">
        <p className="text-sm font-black text-[#b76cff]">
          {text.question} {currentIndex + 1} / {questions.length} · {current.source}
        </p>
        <h3 className="mt-3 text-2xl font-black leading-snug text-ink">{current.stem}</h3>

        <div className="mt-6 grid gap-3">
          {options.map((option) => {
            const active = selected.includes(option.key);
            const correctOption = normalizeAnswer(current.answer).includes(option.key);
            return (
              <button
                key={option.key}
                className={`min-h-14 rounded-2xl border-2 px-5 py-3 text-left text-base font-bold transition ${
                  checkState !== "idle" && correctOption
                    ? "border-[#58cc02] bg-[#58cc02]/10 text-ink"
                    : checkState === "wrong" && active
                      ? "border-coral bg-coral/10 text-coral"
                      : active
                        ? "border-sky-400 bg-sky-50 text-ink"
                        : "border-slate-200 bg-white hover:border-slate-300"
                }`}
                type="button"
                onClick={() => toggleAnswer(current, option.key)}
              >
                <span className="mr-2 text-slate-400">{option.key}.</span> {option.text}
              </button>
            );
          })}
        </div>
      </article>

      <div
        className={`border-t border-slate-200 px-5 py-4 ${
          checkState === "correct" ? "bg-[#58cc02]/20" : checkState === "wrong" ? "bg-coral/10" : "bg-white"
        }`}
      >
        <div className="mx-auto flex min-h-16 w-full max-w-5xl items-center justify-between gap-4">
          {checkState === "idle" ? (
            <button className="secondary-button" type="button" disabled={loading} onClick={skipQuestion}>
              {text.skip}
            </button>
          ) : (
            <div className={`flex min-w-0 items-center gap-3 ${checkState === "correct" ? "text-[#45a000]" : "text-coral"}`}>
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white">
                {checkState === "correct" ? <CheckCircle2 size={26} /> : <XCircle size={26} />}
              </span>
              <div className="min-w-0">
                <p className="text-lg font-black">{checkState === "correct" ? text.correct : text.wrong}</p>
                {checkState === "wrong" ? <p className="truncate text-sm font-semibold">{text.rightAnswer}{answerText(current.answer)}</p> : null}
              </div>
            </div>
          )}

          {checkState === "idle" ? (
            <button
              className="inline-flex min-h-12 w-36 items-center justify-center rounded-2xl border-b-4 border-[#45a000] bg-[#58cc02] px-5 py-2 text-sm font-black text-white transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-400"
              type="button"
              disabled={!canCheck}
              onClick={checkAnswer}
            >
              {text.check}
            </button>
          ) : (
            <button
              className="inline-flex min-h-12 w-36 items-center justify-center gap-2 rounded-2xl border-b-4 border-[#45a000] bg-[#58cc02] px-5 py-2 text-sm font-black text-white transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-400"
              type="button"
              disabled={loading}
              onClick={nextQuestion}
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
              {isLast ? text.done : text.continue}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
