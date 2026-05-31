import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { CheckCircle2, Flame, Gem, RotateCcw, Trophy, XCircle } from "lucide-react";
import { redirect } from "next/navigation";
import { WrongQuestionAi } from "@/components/wrong-question-ai";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getNextSyllabusSectionForStudent, getSyllabusSectionForStudent } from "@/lib/syllabus-learning";

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
  const [access, wrongAttempts, nextSection] = await Promise.all([
    getSyllabusSectionForStudent(user.id, id),
    wrongAttemptIds.length
      ? prisma.questionAttempt.findMany({
          where: {
            id: { in: wrongAttemptIds },
            userId: user.id,
            isCorrect: false
          },
          include: {
            question: true
          },
          orderBy: { createdAt: "asc" }
        })
      : [],
    getNextSyllabusSectionForStudent(user.id, id)
  ]);

  if (!access) {
    redirect("/learn");
  }

  const submittedAt = query?.submittedAt ? new Date(query.submittedAt) : wrongAttempts[0]?.createdAt ?? new Date();
  const score = Number(query?.score || 0);
  const correct = Number(query?.correct || 0);
  const total = Number(query?.total || 0);
  const scorePercent = total ? Math.round((correct / total) * 100) : score;
  const passed = score >= 80;
  const xp = correct * 10;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <section className={passed ? "overflow-hidden rounded-3xl border border-[#58cc02] bg-white shadow-soft" : "overflow-hidden rounded-3xl border border-coral bg-white shadow-soft"}>
        <div className={passed ? "bg-[#58cc02] p-6 text-white" : "bg-coral p-6 text-white"}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-black text-white/80">{access.course.title} / {access.chapter.title} / {access.section.title}</p>
              <h1 className="mt-2 text-4xl font-black">{passed ? "闯关成功" : "还差一点"}</h1>
              <p className="mt-2 text-sm font-semibold text-white/90">做题日期：{formatDate(submittedAt)}</p>
            </div>
            <span className="grid size-16 place-items-center rounded-2xl border-2 border-white/20 bg-white/15">
              {passed ? <Trophy size={34} /> : <RotateCcw size={34} />}
            </span>
          </div>
        </div>

        <div className="grid gap-4 p-5 sm:grid-cols-3">
          <ResultMetric icon={<CheckCircle2 size={22} />} label="正确题数" value={`${correct}/${total}`} tone={passed ? "success" : "danger"} />
          <ResultMetric icon={<Gem size={22} />} label="获得经验" value={`+${xp} XP`} tone="sky" />
          <ResultMetric icon={<Flame size={22} />} label="本关得分" value={`${score} 分`} tone={passed ? "success" : "danger"} />
        </div>

        <div className="px-5 pb-5">
          <div className="h-3 rounded-full bg-slate-100">
            <div className={passed ? "h-3 rounded-full bg-[#58cc02]" : "h-3 rounded-full bg-coral"} style={{ width: `${scorePercent}%` }} />
          </div>
          <p className="mt-3 text-sm font-semibold text-slate-600">
            {passed ? "下一关已经为你准备好了，继续保持节奏。" : "达到 80 分即可解锁下一关，先把错题吃透再挑战。"}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            {passed && nextSection ? (
              <Link className="primary-button bg-[#58cc02] hover:bg-[#58cc02]/90" href={`/learn/${nextSection.section.id}`}>继续下一关</Link>
            ) : (
              <Link className="primary-button bg-[#58cc02] hover:bg-[#58cc02]/90" href={`/learn/${id}`}>再练一次</Link>
            )}
            <Link className="secondary-button" href={`/learn?course=${access.group.key}&chapter=${access.chapter.id}`}>返回学习路线</Link>
            {wrongAttempts.length > 0 ? <Link className="secondary-button" href="/wrong-book">查看错题本</Link> : null}
          </div>
        </div>
      </section>

      {wrongAttempts.length === 0 ? (
        <section className="panel mt-6">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-1 text-teal" />
            <div>
              <h2 className="text-xl font-bold">本次没有错题</h2>
              <p className="mt-2 text-slate-600">这一关答得很稳，可以继续推进下一关。</p>
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
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-coral">错题 {index + 1}</p>
                    <h3 className="mt-2 text-lg font-bold leading-relaxed">{attempt.question.stem}</h3>
                  </div>
                  <span className="badge bg-coral/10 text-coral">需要复习</span>
                </div>
                <div className="mt-4 grid gap-2">
                  {options.map((option) => (
                    <div key={option.key} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6">
                      <span className="font-semibold">{option.key}.</span> {option.text}
                    </div>
                  ))}
                </div>
                <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <p className="rounded-2xl bg-coral/10 p-4 text-coral"><span className="font-semibold">你的答案：</span>{answerText(attempt.selectedAnswer)}</p>
                  <p className="rounded-2xl bg-teal/10 p-4 text-teal"><span className="font-semibold">正确答案：</span>{answerText(attempt.question.answer)}</p>
                </div>
                <div className="mt-3 rounded-2xl bg-mist p-4">
                  <p className="text-xs font-semibold text-slate-500">解析</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{attempt.question.analysis}</p>
                </div>
                <WrongQuestionAi questionId={attempt.questionId} />
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}

function ResultMetric({
  icon,
  label,
  value,
  tone
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "success" | "danger" | "sky";
}) {
  const toneClass = {
    success: "bg-[#58cc02]/10 text-[#45a000]",
    danger: "bg-coral/10 text-coral",
    sky: "bg-sky-50 text-sky-500"
  }[tone];

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
      <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${toneClass}`}>{icon}</span>
      <div>
        <p className="text-xs font-bold text-slate-400">{label}</p>
        <p className="mt-1 text-lg font-black text-ink">{value}</p>
      </div>
    </div>
  );
}
