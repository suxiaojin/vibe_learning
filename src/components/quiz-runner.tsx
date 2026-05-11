"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, HelpCircle, Loader2, XCircle } from "lucide-react";

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
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [result, setResult] = useState<{ score: number; passed: boolean; correct: number; total: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiQuestion, setAiQuestion] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

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
    setResult(payload);
    setLoading(false);
  }

  async function askAi(questionId: string, prompt?: string) {
    setAiQuestion(questionId);
    setAiLoading(true);
    setAiAnswer("");
    const response = await fetch("/api/ai/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId, prompt: prompt || "请把这道题用通俗的方式讲解一下。" })
    });
    const payload = await response.json();
    setAiAnswer(payload.answer || payload.error || "AI 暂时无法回答，请稍后重试。");
    setAiLoading(false);
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
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-teal">第 {index + 1} 题 · {question.source}</p>
                <h3 className="mt-2 text-lg font-bold leading-relaxed">{question.stem}</h3>
              </div>
              <button className="secondary-button" type="button" onClick={() => askAi(question.id)}>
                <HelpCircle size={18} />
                AI解释
              </button>
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
            {aiQuestion === question.id ? (
              <div className="mt-5 rounded-2xl bg-mist p-4">
                {aiLoading ? (
                  <p className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="animate-spin" size={16} />AI 正在组织讲解...</p>
                ) : (
                  <>
                    <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{aiAnswer}</p>
                    <div className="mt-3 flex gap-2">
                      <input className="input" value={aiPrompt} onChange={(event) => setAiPrompt(event.target.value)} placeholder="继续追问这道题" />
                      <button className="primary-button" type="button" onClick={() => askAi(question.id, aiPrompt)}>追问</button>
                    </div>
                  </>
                )}
              </div>
            ) : null}
          </article>
        );
      })}
      <div className="panel sticky bottom-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-semibold">完成全部题目后提交</p>
          <p className="text-sm text-slate-600">达到 80% 正确率即可解锁下一关。</p>
        </div>
        <button className="primary-button" type="button" disabled={!canSubmit || loading} onClick={submit}>
          {loading ? <Loader2 className="animate-spin" size={18} /> : null}
          提交闯关
        </button>
      </div>
      {result ? (
        <div className={`panel ${result.passed ? "border-teal" : "border-coral"}`}>
          <div className="flex items-center gap-3">
            {result.passed ? <CheckCircle2 className="text-teal" /> : <XCircle className="text-coral" />}
            <div>
              <h3 className="text-xl font-bold">{result.passed ? "闯关成功" : "继续练习"}</h3>
              <p className="text-slate-600">
                正确 {result.correct}/{result.total}，得分 {result.score}。{result.passed ? "下一关已解锁。" : "错题已加入错题本。"}
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
