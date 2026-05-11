import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { CheckCircle2, XCircle } from "lucide-react";
import { WrongQuestionAi } from "@/components/wrong-question-ai";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Option = {
  key: string;
  text: string;
};

function coerceOptions(options: Prisma.JsonValue): Option[] {
  if (!Array.isArray(options)) {
    return [];
  }

  return options
    .map((item) => {
      if (typeof item === "object" && item && "key" in item && "text" in item) {
        return { key: String(item.key), text: String(item.text) };
      }
      return null;
    })
    .filter(Boolean) as Option[];
}

function answerText(answer: Prisma.JsonValue) {
  return Array.isArray(answer) ? answer.map(String).join("、") : String(answer || "");
}

function formatDate(date: Date) {
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Shanghai"
  });
}

export default async function QuizResultPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ attemptIds?: string; score?: string; correct?: string; total?: string; submittedAt?: string }>;
}) {
  const [{ id }, query, user] = await Promise.all([params, searchParams, requireUser()]);
  const wrongAttemptIds = (query?.attemptIds || "").split(",").filter(Boolean);
  const [point, wrongAttempts] = await Promise.all([
    prisma.knowledgePoint.findUnique({
      where: { id },
      include: { chapter: true }
    }),
    wrongAttemptIds.length
      ? prisma.questionAttempt.findMany({
          where: {
            id: { in: wrongAttemptIds },
            userId: user.id,
            isCorrect: false,
            question: { knowledgePointId: id }
          },
          include: {
            question: true
          },
          orderBy: { createdAt: "asc" }
        })
      : []
  ]);

  const submittedAt = query?.submittedAt ? new Date(query.submittedAt) : wrongAttempts[0]?.createdAt ?? new Date();
  const score = Number(query?.score || 0);
  const correct = Number(query?.correct || 0);
  const total = Number(query?.total || 0);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <section className="panel">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-teal">{point?.chapter.title || "章节"} / {point?.title || "知识点"}</p>
            <h1 className="mt-2 text-3xl font-bold">本次答题结果</h1>
            <p className="mt-2 text-slate-600">做题日期：{formatDate(submittedAt)}</p>
          </div>
          <span className={`badge ${wrongAttempts.length === 0 ? "bg-teal/10 text-teal" : "bg-coral/10 text-coral"}`}>
            正确 {correct}/{total} · 得分 {score}
          </span>
        </div>
      </section>

      {wrongAttempts.length === 0 ? (
        <section className="panel mt-6">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-1 text-teal" />
            <div>
              <h2 className="text-xl font-bold">本次没有错题</h2>
              <p className="mt-2 text-slate-600">这一关答得很稳，可以继续下一关。</p>
              <Link className="primary-button mt-5" href="/learn">返回闯关路线</Link>
            </div>
          </div>
        </section>
      ) : (
        <section className="mt-6 space-y-4">
          <div className="flex items-center gap-2 text-coral">
            <XCircle size={20} />
            <h2 className="text-xl font-bold">本次做错的题目</h2>
          </div>
          {wrongAttempts.map((attempt, index) => {
            const options = coerceOptions(attempt.question.options);
            return (
              <article key={attempt.id} className="panel">
                <p className="text-sm font-semibold text-coral">错题 {index + 1}</p>
                <h3 className="mt-2 text-lg font-bold leading-relaxed">{attempt.question.stem}</h3>
                <div className="mt-4 grid gap-2">
                  {options.map((option) => (
                    <div key={option.key} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
                      <span className="font-semibold">{option.key}.</span> {option.text}
                    </div>
                  ))}
                </div>
                <div className="mt-4 grid gap-3 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700 sm:grid-cols-2">
                  <p><span className="font-semibold text-ink">你的答案：</span>{answerText(attempt.selectedAnswer)}</p>
                  <p><span className="font-semibold text-ink">正确答案：</span>{answerText(attempt.question.answer)}</p>
                </div>
                <p className="mt-3 rounded-2xl bg-mist p-4 text-sm leading-6 text-slate-700">{attempt.question.analysis}</p>
                <WrongQuestionAi questionId={attempt.questionId} />
              </article>
            );
          })}
          <div className="flex flex-wrap gap-3">
            <Link className="primary-button" href={`/learn/${id}`}>再练一次</Link>
            <Link className="secondary-button" href="/wrong-book">查看错题本</Link>
            <Link className="secondary-button" href="/learn">返回闯关路线</Link>
          </div>
        </section>
      )}
    </main>
  );
}
