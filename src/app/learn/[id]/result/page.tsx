import type { ReactNode } from "react";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { CheckCircle2, Flame, Gem, RotateCcw, Trophy, XCircle } from "lucide-react";
import { redirect } from "next/navigation";
import { ShareToBuddyButton, type ShareCopySuggestion } from "@/components/share-to-buddy-button";
import { WrongQuestionAi } from "@/components/wrong-question-ai";
import type { BuddyShareCard } from "@/lib/buddy-share-cards";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getNextSyllabusSectionForStudent, getSyllabusSectionForStudent } from "@/lib/syllabus-learning";
import { cn } from "@/lib/utils";

type Option = {
  key: string;
  text: string;
};

type SessionWithAttempts = Prisma.QuizSessionGetPayload<{
  include: {
    attempts: {
      include: {
        question: true;
      };
    };
  };
}>;

type AttemptWithQuestion = SessionWithAttempts["attempts"][number];

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

function formatDateTime(date: Date) {
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai"
  });
}

export default async function QuizResultPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ sessionId?: string }>;
}) {
  const [{ id }, query, user] = await Promise.all([params, searchParams, requireUser()]);
  const [access, sessions, nextSection] = await Promise.all([
    getSyllabusSectionForStudent(user.id, id),
    prisma.quizSession.findMany({
      where: {
        userId: user.id,
        syllabusItemId: id,
        status: "completed"
      },
      include: {
        attempts: {
          include: { question: true },
          orderBy: { createdAt: "asc" }
        }
      },
      orderBy: [{ completedAt: "desc" }, { updatedAt: "desc" }],
      take: 20
    }),
    getNextSyllabusSectionForStudent(user.id, id)
  ]);

  if (!access) {
    redirect("/learn");
  }

  const currentSession = query?.sessionId
    ? sessions.find((session) => session.id === query.sessionId) || sessions[0]
    : sessions[0];

  if (!currentSession) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8">
        <section className="panel">
          <h1 className="text-2xl font-black text-ink">暂无答题记录</h1>
          <p className="mt-2 text-sm font-semibold text-slate-500">完成一次答题后，这里会展示每次作答的对题和错题。</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link className="primary-button bg-[#58cc02] hover:bg-[#58cc02]/90" href={`/learn/${id}?restart=1`}>开始答题</Link>
            <Link className="secondary-button" href={`/learn?course=${access.group.key}&chapter=${access.chapter.id}`}>返回学习路线</Link>
          </div>
        </section>
      </main>
    );
  }

  const total = currentSession.totalCount || currentSession.attempts.length || access.section.questionCount;
  const correct = currentSession.correctCount || currentSession.attempts.filter((attempt) => attempt.isCorrect).length;
  const score = currentSession.score ?? (total ? Math.round((correct / total) * 100) : 0);
  const scorePercent = total ? Math.round((correct / total) * 100) : score;
  const passed = score >= 80;
  const submittedAt = currentSession.completedAt || currentSession.updatedAt;
  const currentWrongAttempts = currentSession.attempts.filter((attempt) => !attempt.isCorrect);
  const resultShareCard = buildResultShareCard({
    chapterTitle: access.chapter.title,
    correct,
    courseTitle: access.course.title,
    diamondRewardAmount: currentSession.diamondRewardAmount,
    passed,
    score,
    sectionTitle: access.section.title,
    submittedAt,
    total
  });
  const resultShareContent = passed ? "刚闯关成功，下一关继续保持节奏。" : "刚完成一次闯关复盘，把错题吃透再冲。";
  const resultShareSuggestions = getResultShareSuggestions(passed);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <section className={passed ? "overflow-hidden rounded-3xl border border-[#58cc02] bg-white shadow-soft" : "overflow-hidden rounded-3xl border border-coral bg-white shadow-soft"}>
        <div className={passed ? "bg-[#58cc02] p-6 text-white" : "bg-coral p-6 text-white"}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-black text-white/80">{access.course.title} / {access.chapter.title} / {access.section.title}</p>
              <h1 className="mt-2 text-4xl font-black">{passed ? "闯关成功" : "还差一点"}</h1>
              <p className="mt-2 text-sm font-semibold text-white/90">做题日期：{formatDateTime(submittedAt)}</p>
            </div>
            <span className="grid size-16 place-items-center rounded-2xl border-2 border-white/20 bg-white/15">
              {passed ? <Trophy size={34} /> : <RotateCcw size={34} />}
            </span>
          </div>
        </div>

        <div className="grid gap-4 p-5 sm:grid-cols-3">
          <ResultMetric icon={<CheckCircle2 size={22} />} label="正确题数" value={`${correct}/${total}`} tone={passed ? "success" : "danger"} />
          <ResultMetric icon={<Gem size={22} />} label="获得钻石" value={`+${currentSession.diamondRewardAmount} 钻石`} tone="sky" />
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
              <Link className="primary-button bg-[#58cc02] hover:bg-[#58cc02]/90" href={`/learn/${id}?restart=1`}>再练一次</Link>
            )}
            <ShareToBuddyButton
              buttonClassName={passed ? "min-h-12 border-[#58cc02]/30 text-[#45a000]" : "min-h-12 border-coral/30 text-coral"}
              contentSuggestions={resultShareSuggestions}
              copyContext={passed ? "quiz_passed" : "quiz_failed"}
              defaultContent={resultShareContent}
              shareCard={resultShareCard}
              sourceLabel="闯关结果"
            />
            <Link className="secondary-button" href={`/learn?course=${access.group.key}&chapter=${access.chapter.id}`}>返回学习路线</Link>
            {currentWrongAttempts.length > 0 ? <Link className="secondary-button" href="/wrong-book">查看错题本</Link> : null}
          </div>
        </div>
      </section>

      <section className="mt-6 space-y-5">
        <div className="flex items-center gap-2 text-ink">
          <CheckCircle2 className="text-teal" size={20} />
          <h2 className="text-xl font-black">历史答题记录</h2>
        </div>
        {sessions.map((session) => {
          const correctAttempts = session.attempts.filter((attempt) => attempt.isCorrect);
          const wrongAttempts = session.attempts.filter((attempt) => !attempt.isCorrect);
          return (
            <article key={session.id} className="panel">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-lg font-black text-ink">{formatDateTime(session.completedAt || session.updatedAt)}</h3>
                  <p className="mt-1 text-sm font-semibold text-slate-500">正确 {correctAttempts.length} 题，错误 {wrongAttempts.length} 题</p>
                </div>
                <span className={cn("badge", (session.score || 0) >= 80 ? "bg-[#58cc02]/10 text-[#45a000]" : "bg-coral/10 text-coral")}>
                  {session.score ?? 0} 分
                </span>
              </div>

              <AttemptGroup attempts={correctAttempts} title="做对的题" tone="correct" />
              <AttemptGroup attempts={wrongAttempts} title="做错的题" tone="wrong" />
            </article>
          );
        })}
      </section>
    </main>
  );
}

function AttemptGroup({ attempts, title, tone }: { attempts: AttemptWithQuestion[]; title: string; tone: "correct" | "wrong" }) {
  return (
    <section className="mt-5">
      <div className={cn("flex items-center gap-2", tone === "correct" ? "text-[#45a000]" : "text-coral")}>
        {tone === "correct" ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
        <h4 className="font-black">{title}</h4>
      </div>
      {attempts.length === 0 ? (
        <p className="mt-3 rounded-2xl bg-mist px-4 py-3 text-sm font-semibold text-slate-500">暂无</p>
      ) : (
        <div className="mt-3 space-y-4">
          {attempts.map((attempt, index) => (
            <AttemptCard key={attempt.id} attempt={attempt} index={index} tone={tone} />
          ))}
        </div>
      )}
    </section>
  );
}

function AttemptCard({ attempt, index, tone }: { attempt: AttemptWithQuestion; index: number; tone: "correct" | "wrong" }) {
  const options = coerceOptions(attempt.question.options);
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={cn("text-sm font-semibold", tone === "correct" ? "text-[#45a000]" : "text-coral")}>{tone === "correct" ? "对题" : "错题"} {index + 1}</p>
          <h3 className="mt-2 text-lg font-bold leading-relaxed">{attempt.question.stem}</h3>
        </div>
        <span className={cn("badge", tone === "correct" ? "bg-[#58cc02]/10 text-[#45a000]" : "bg-coral/10 text-coral")}>
          {tone === "correct" ? "已掌握" : "需要复习"}
        </span>
      </div>
      <div className="mt-4 grid gap-2">
        {options.map((option) => (
          <div key={option.key} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6">
            <span className="font-semibold">{option.key}.</span> {option.text}
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <p className={cn("rounded-2xl p-4", tone === "correct" ? "bg-[#58cc02]/10 text-[#45a000]" : "bg-coral/10 text-coral")}>
          <span className="font-semibold">你的答案：</span>{answerText(attempt.selectedAnswer)}
        </p>
        <p className="rounded-2xl bg-teal/10 p-4 text-teal">
          <span className="font-semibold">正确答案：</span>{answerText(attempt.question.answer)}
        </p>
      </div>
      {attempt.question.analysis ? (
        <div className="mt-3 rounded-2xl bg-mist p-4">
          <p className="text-xs font-semibold text-slate-500">解析</p>
          <p className="mt-2 text-sm leading-6 text-slate-700">{attempt.question.analysis}</p>
        </div>
      ) : null}
      {tone === "wrong" ? <WrongQuestionAi questionId={attempt.questionId} /> : null}
    </article>
  );
}

function buildResultShareCard({
  chapterTitle,
  correct,
  courseTitle,
  diamondRewardAmount,
  passed,
  score,
  sectionTitle,
  submittedAt,
  total
}: {
  chapterTitle: string;
  correct: number;
  courseTitle: string;
  diamondRewardAmount: number;
  passed: boolean;
  score: number;
  sectionTitle: string;
  submittedAt: Date;
  total: number;
}): BuddyShareCard {
  return {
    type: "quiz_result_card",
    chapterTitle: clipShareText(chapterTitle, 32),
    correct,
    courseTitle: clipShareText(courseTitle, 32),
    diamondRewardAmount,
    passed,
    score,
    sectionTitle: clipShareText(sectionTitle, 42),
    submittedAtLabel: formatDateTime(submittedAt),
    total
  };
}

function getResultShareSuggestions(passed: boolean): ShareCopySuggestion[] {
  if (passed) {
    return [
      { label: "继续冲", content: "刚闯关成功，下一关继续保持节奏。" },
      { label: "满血通关", content: "这关顺利拿下，今天的学习进度继续推进。" },
      { label: "打卡记录", content: "完成一关，给今天的学习打个卡。" }
    ];
  }
  return [
    { label: "复盘再战", content: "刚完成一次闯关复盘，把错题吃透再冲。" },
    { label: "错题提醒", content: "这关还差一点，先把薄弱点标出来。" },
    { label: "稳住节奏", content: "没关系，复盘完再来一次，节奏不能乱。" }
  ];
}

function clipShareText(value: string, maxLength: number) {
  const textValue = value.replace(/\s+/g, " ").trim();
  return textValue.length > maxLength ? `${textValue.slice(0, maxLength)}...` : textValue;
}

function ResultMetric({
  icon,
  label,
  value,
  tone
}: {
  icon: ReactNode;
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
