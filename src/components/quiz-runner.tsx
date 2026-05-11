"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

type Question = {
  id: string;
  type: "single_choice" | "multiple_choice" | "true_false";
  stem: string;
  options: unknown;
  source: string;
};

type Option = {
  key: string;
  text: string;
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

export function QuizRunner({ pointId, questions }: { pointId: string; questions: Question[] }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(() => questions.every((question) => answers[question.id]?.length), [answers, questions]);

  function toggleAnswer(question: Question, key: string) {
    setAnswers((current) => {
      const selected = current[question.id] || [];
      if (question.type === "multiple_choice") {
        const next = selected.includes(key) ? selected.filter((item) => item !== key) : [...selected, key];
        return { ...current, [question.id]: next };
      }
      return { ...current, [question.id]: [key] };
    });
  }

  async function submit() {
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

  if (questions.length === 0) {
    return <div className="panel mt-6 text-slate-600">这个知识点还没有发布题目，请先在后台录入题目。</div>;
  }

  return (
    <section className="mt-6 space-y-5">
      {questions.map((question, index) => {
        const options = coerceOptions(question.options);
        return (
          <article key={question.id} className="panel">
            <div>
              <p className="text-sm font-semibold text-teal">第 {index + 1} 题 · {question.source}</p>
              <h3 className="mt-2 text-lg font-bold leading-relaxed">{question.stem}</h3>
            </div>
            <div className="mt-4 grid gap-3">
              {options.map((option) => {
                const active = answers[question.id]?.includes(option.key);
                return (
                  <button
                    key={option.key}
                    className={`min-h-12 rounded-xl border px-4 py-3 text-left transition ${
                      active ? "border-teal bg-teal/10 text-ink" : "border-slate-200 bg-white hover:border-teal"
                    }`}
                    type="button"
                    onClick={() => toggleAnswer(question, option.key)}
                  >
                    <span className="font-semibold">{option.key}.</span> {option.text}
                  </button>
                );
              })}
            </div>
          </article>
        );
      })}
      <div className="panel sticky bottom-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-semibold">完成全部题目后提交</p>
          <p className="text-sm text-slate-600">提交后会进入本次错题页，集中查看错题和 AI 解释。</p>
        </div>
        <button className="primary-button" type="button" disabled={!canSubmit || loading} onClick={submit}>
          {loading ? <Loader2 className="animate-spin" size={18} /> : null}
          提交并查看结果
        </button>
      </div>
    </section>
  );
}
