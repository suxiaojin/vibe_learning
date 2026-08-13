import type { ReactNode } from "react";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { CheckCircle2, Flame, Gem, RotateCcw, Trophy, XCircle } from "lucide-react";
import { redirect } from "next/navigation";
import { ShareToBuddyButton, type ShareCopySuggestion } from "@/components/share-to-buddy-button";
import { StudentPageShell } from "@/components/student-page-shell";
import { WrongQuestionAi } from "@/components/wrong-question-ai";
import type { BuddyShareCard } from "@/lib/buddy-share-cards";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSyllabusSectionForStudent } from "@/lib/syllabus-learning";
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
  const [access, sessions, requestedSession] = await Promise.all([
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
    query?.sessionId
      ? prisma.quizSession.findFirst({
          where: {
            id: query.sessionId,
            userId: user.id,
            syllabusItemId: id,
            status: "completed"
          },
          include: {
            attempts: {
              include: { question: true },
              orderBy: { createdAt: "asc" }
            }
          }
        })
      : Promise.resolve(null)
  ]);

  if (!access) {
    redirect("/learn");
  }

  const currentSession = requestedSession || sessions[0];

  if (!currentSession) {
    return (
      <StudentPageShell active="learn" maxWidthClassName="max-w-5xl">
        <section className="panel">
          <h1 className="text-2xl font-semibold text-ink">暂无答题记录</h1>
          <p className="mt-2 text-sm font-medium text-slate-500">完成一次答题后，这里会展示每次作答的对题和错题。</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link className="success-button" href={`/learn/${id}?restart=1`}>开始答题</Link>
            <Link className="secondary-button" href={`/learn?course=${access.group.key}&chapter=${access.chapter.id}`}>返回学习路线</Link>
          </div>
        </section>
      </StudentPageShell>
    );
  }

  const total = currentSession.totalCount || currentSession.attempts.length || access.section.questionCount;
  const correct = currentSession.correctCount || currentSession.attempts.filter((attempt) => attempt.isCorrect).length;
  const score = currentSession.score ?? (total ? Math.round((correct / total) * 100) : 0);
  const scorePercent = total ? Math.round((correct / total) * 100) : score;
  const passed = score >= 80;
  const submittedAt = currentSession.completedAt || currentSession.updatedAt;
  const currentChapterIndex = access.course.chapters.findIndex((chapter) => chapter.id === access.chapter.id);
  const hasNextChapterInCourse = currentChapterIndex >= 0 && currentChapterIndex < access.course.chapters.length - 1;
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
    <StudentPageShell active="learn" maxWidthClassName="max-w-5xl">
      <section className={cn("overflow-hidden rounded-panel border bg-surface shadow-card", passed ? "border-success/50" : "border-coral/50")}>
        <div className={passed ? "bg-success p-6 text-white" : "bg-coral p-6 text-white"}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-white/85">{access.course.title} / {access.chapter.title}</p>
              <h1 className="mt-2 text-3xl font-bold leading-tight">{passed ? "闯关成功" : "还差一点"}</h1>
              <p className="mt-2 text-sm font-medium text-white/90">做题日期：{formatDateTime(submittedAt)}</p>
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
            <div className={passed ? "h-3 rounded-full bg-success" : "h-3 rounded-full bg-coral"} style={{ width: `${scorePercent}%` }} />
          </div>
          <p className="mt-3 text-sm font-semibold text-slate-600">
            {passed
              ? hasNextChapterInCourse
                ? "闯关成功，返回学习路线进入下一章"
                : "闯关成功，已完成本课程全部章节"
              : "还差一点，再练一次"}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link className="success-button" href={`/learn/${id}?restart=1&fromSessionId=${currentSession.id}`}>再练一次</Link>
            <ShareToBuddyButton
              buttonClassName={passed ? "min-h-12 border-success/30 text-success-strong" : "min-h-12 border-coral/30 text-coral"}
              contentSuggestions={resultShareSuggestions}
              copyContext={passed ? "quiz_passed" : "quiz_failed"}
              defaultContent={resultShareContent}
              shareCard={resultShareCard}
              sourceLabel="闯关结果"
            />
            <Link className="secondary-button" href={`/learn?course=${access.group.key}&chapter=${access.chapter.id}`}>返回学习路线</Link>
          </div>
        </div>
      </section>

      <section className="mt-6 space-y-5">
        <div className="flex items-center gap-2 text-ink">
          <CheckCircle2 className="text-teal" size={20} />
          <h2 className="text-xl font-semibold">历史答题记录</h2>
        </div>
        {sessions.map((session) => {
          const correctAttempts = session.attempts.filter((attempt) => attempt.isCorrect);
          const wrongAttempts = session.attempts.filter((attempt) => !attempt.isCorrect);
          return (
            <article key={session.id} className="panel">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-soft pb-4">
                <div>
                  <h3 className="text-lg font-semibold text-ink">{formatDateTime(session.completedAt || session.updatedAt)}</h3>
                  <p className="mt-1 text-sm font-semibold text-slate-500">正确 {correctAttempts.length} 题，错误 {wrongAttempts.length} 题</p>
                </div>
                <span className={cn("badge", (session.score || 0) >= 80 ? "bg-success-muted text-success-strong" : "bg-coral/10 text-coral")}>
                  {session.score ?? 0} 分
                </span>
              </div>

              <AttemptGroup attempts={correctAttempts} title="做对的题" tone="correct" />
              <AttemptGroup attempts={wrongAttempts} title="做错的题" tone="wrong" />
            </article>
          );
        })}
      </section>
    </StudentPageShell>
  );
}

function AttemptGroup({ attempts, title, tone }: { attempts: AttemptWithQuestion[]; title: string; tone: "correct" | "wrong" }) {
  return (
    <section className="mt-5">
      <div className={cn("flex items-center gap-2", tone === "correct" ? "text-success-strong" : "text-coral")}>
        {tone === "correct" ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
        <h4 className="font-semibold">{title}</h4>
      </div>
      {attempts.length === 0 ? (
        <p className="mt-3 rounded-2xl bg-mist px-4 py-3 text-sm font-medium text-slate-500">暂无</p>
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
    <article className="rounded-panel border border-border-soft bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={cn("text-sm font-semibold", tone === "correct" ? "text-success-strong" : "text-coral")}>{tone === "correct" ? "对题" : "错题"} {index + 1}</p>
          <h3 className="mt-2 text-lg font-bold leading-relaxed">{attempt.question.stem}</h3>
        </div>
        <span className={cn("badge", tone === "correct" ? "bg-success-muted text-success-strong" : "bg-coral/10 text-coral")}>
          {tone === "correct" ? "已掌握" : "需要复习"}
        </span>
      </div>
      <div className="mt-4 grid gap-2">
        {options.map((option) => (
          <div key={option.key} className="rounded-xl border border-border-soft bg-surface px-4 py-3 text-sm leading-6">
            <span className="font-semibold">{option.key}.</span> {option.text}
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <p className={cn("rounded-xl p-4", tone === "correct" ? "bg-success-muted text-success-strong" : "bg-coral/10 text-coral")}>
          <span className="font-semibold">你的答案：</span>{answerText(attempt.selectedAnswer)}
        </p>
        <p className="rounded-xl bg-teal/10 p-4 text-teal">
          <span className="font-semibold">正确答案：</span>{answerText(attempt.question.answer)}
        </p>
      </div>
      {attempt.question.analysis ? (
        <div className="mt-3 rounded-xl bg-mist p-4">
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
    success: "bg-success-muted text-success-strong",
    danger: "bg-coral/10 text-coral",
    sky: "bg-sky-50 text-sky-500"
  }[tone];

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border-soft bg-surface p-4">
      <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${toneClass}`}>{icon}</span>
      <div>
        <p className="text-xs font-bold text-slate-400">{label}</p>
        <p className="mt-1 text-lg font-semibold text-ink">{value}</p>
      </div>
    </div>
  );
}
