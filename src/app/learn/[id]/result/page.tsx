import type { ReactNode } from "react";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { CheckCircle2, ChevronRight, Circle, Flame, Gem, RotateCcw, Trophy, XCircle } from "lucide-react";
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
    chapterChallengeVersion: {
      select: {
        status: true;
        version: true;
      };
    };
    attempts: {
      include: {
        question: true;
      };
    };
  };
}>;

type AttemptWithQuestion = SessionWithAttempts["attempts"][number];

const HISTORY_PAGE_SIZE = 6;
const MAX_HISTORY_LIMIT = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

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

function formatHistoryDateTime(date: Date) {
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai"
  });
}

function normalizeHistoryLimit(value?: string) {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed)) {
    return HISTORY_PAGE_SIZE;
  }
  return Math.min(MAX_HISTORY_LIMIT, Math.max(HISTORY_PAGE_SIZE, parsed));
}

function beijingDayIndex(date: Date) {
  const shifted = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return Math.floor(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) / DAY_MS);
}

function historyGroupLabel(date: Date, now: Date) {
  const dayDifference = beijingDayIndex(now) - beijingDayIndex(date);
  if (dayDifference <= 0) {
    return "今天";
  }
  if (dayDifference === 1) {
    return "昨天";
  }
  if (dayDifference <= 7) {
    return "近一周";
  }
  return "更早";
}

function groupHistorySessions(sessions: SessionWithAttempts[]) {
  const now = new Date();
  const groups: Array<{ label: string; sessions: SessionWithAttempts[] }> = [];

  for (const session of sessions) {
    const label = historyGroupLabel(session.completedAt || session.updatedAt, now);
    const currentGroup = groups.at(-1);
    if (currentGroup?.label === label) {
      currentGroup.sessions.push(session);
    } else {
      groups.push({ label, sessions: [session] });
    }
  }

  return groups;
}

function getChallengeNumber(session: SessionWithAttempts) {
  const challenge = session.chapterChallengeVersion;
  return challenge?.status === "published" && challenge.version > 0 ? challenge.version : null;
}

function getChallengeLabel(session: SessionWithAttempts) {
  const challengeNumber = getChallengeNumber(session);
  return challengeNumber ? `关卡${challengeNumber}` : "历史关卡";
}

function buildHistoryHref({
  sectionId,
  sessionId,
  historyLimit,
  showDetails,
  anchor
}: {
  sectionId: string;
  sessionId: string;
  historyLimit: number;
  showDetails?: boolean;
  anchor: string;
}) {
  const query = new URLSearchParams({ sessionId, historyLimit: String(historyLimit) });
  if (showDetails) {
    query.set("details", "1");
  }
  return `/learn/${sectionId}/result?${query.toString()}#${anchor}`;
}

export default async function QuizResultPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ sessionId?: string; historyLimit?: string; details?: string }>;
}) {
  const [{ id }, query, user] = await Promise.all([params, searchParams, requireUser()]);
  const historyLimit = normalizeHistoryLimit(query?.historyLimit);
  const [access, sessions, requestedSession, historyCount, chapterChallengeCount] = await Promise.all([
    getSyllabusSectionForStudent(user.id, id),
    prisma.quizSession.findMany({
      where: {
        userId: user.id,
        syllabusItemId: id,
        status: "completed"
      },
      include: {
        chapterChallengeVersion: {
          select: { status: true, version: true }
        },
        attempts: {
          include: { question: true },
          orderBy: { createdAt: "asc" }
        }
      },
      orderBy: [{ completedAt: "desc" }, { updatedAt: "desc" }],
      take: historyLimit + 1
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
            chapterChallengeVersion: {
              select: { status: true, version: true }
            },
            attempts: {
              include: { question: true },
              orderBy: { createdAt: "asc" }
            }
          }
        })
      : Promise.resolve(null),
    prisma.quizSession.count({
      where: {
        userId: user.id,
        syllabusItemId: id,
        status: "completed"
      }
    }),
    prisma.chapterChallengeVersion.count({
      where: {
        chapterId: id,
        status: "published",
        questions: { some: {} }
      }
    })
  ]);

  if (!access) {
    redirect("/learn");
  }

  const visibleSessions = sessions.slice(0, historyLimit);
  const hasMoreHistory = sessions.length > historyLimit && historyLimit < MAX_HISTORY_LIMIT;
  const currentSession = requestedSession || visibleSessions[0];

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
  const currentChallengeNumber = getChallengeNumber(currentSession);
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
  const historyGroups = groupHistorySessions(visibleSessions);
  const showHistoryDetails = query?.details === "1";
  const selectedCorrectAttempts = currentSession.attempts.filter((attempt) => attempt.isCorrect);
  const selectedWrongAttempts = currentSession.attempts.filter((attempt) => !attempt.isCorrect);
  const nextHistoryLimit = Math.min(MAX_HISTORY_LIMIT, historyLimit + HISTORY_PAGE_SIZE, historyCount);
  const moreHistoryHref = buildHistoryHref({
    sectionId: id,
    sessionId: currentSession.id,
    historyLimit: nextHistoryLimit,
    showDetails: showHistoryDetails,
    anchor: "history-records"
  });
  const closeHistoryDetailsHref = buildHistoryHref({
    sectionId: id,
    sessionId: currentSession.id,
    historyLimit,
    anchor: "history-records"
  });

  return (
    <StudentPageShell active="learn" maxWidthClassName="max-w-5xl">
      <section className={cn("overflow-hidden rounded-panel border bg-surface shadow-card", passed ? "border-success/50" : "border-coral/50")}>
        <div className={passed ? "bg-success p-6 text-white" : "bg-coral p-6 text-white"}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-white/85">{access.course.title} / {access.chapter.title}</p>
              <h1 className="mt-2 text-3xl font-bold leading-tight">{passed ? "闯关成功" : "还差一点"}</h1>
              <p className="mt-2 text-sm font-medium text-white/90">通过本章任一关卡，即可解锁下一章关卡</p>
            </div>
            <span className="grid size-16 place-items-center rounded-2xl border-2 border-white/20 bg-white/15">
              {passed ? <Trophy size={34} /> : <RotateCcw size={34} />}
            </span>
          </div>
        </div>

        <div className="grid gap-4 p-5 sm:grid-cols-3">
          <ResultMetric icon={<CheckCircle2 size={22} />} label="正确题数" value={`${correct}/${total}`} tone={passed ? "success" : "danger"} />
          <ResultMetric icon={<Gem size={22} />} label="获得钻石" value={`+${currentSession.diamondRewardAmount} 钻石`} tone="sky" />
          <ResultMetric
            icon={<Flame size={22} />}
            label="本章关卡"
            value={currentChallengeNumber ? `${currentChallengeNumber}/${chapterChallengeCount}` : "历史关卡"}
            tone={passed ? "success" : "danger"}
          />
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

      <section className="mt-6 scroll-mt-6" id="history-records">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-ink">
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 className="text-teal" size={20} />
            <h2 className="text-xl font-semibold">历史答题记录</h2>
          </span>
          <span className="text-sm font-semibold text-slate-400">共 {historyCount} 次</span>
        </div>

        <div className="mt-5 space-y-5">
          {historyGroups.map((group, groupIndex) => (
            <div className="grid gap-3 sm:grid-cols-[5.5rem_minmax(0,1fr)] sm:gap-5" key={group.label}>
              <div className="relative flex items-start gap-2 pt-3 text-sm font-semibold text-slate-600 sm:justify-end">
                <span>{group.label}</span>
                <Circle className="relative z-10 shrink-0 fill-mist text-slate-500" size={16} strokeWidth={2.5} />
                {groupIndex < historyGroups.length - 1 ? (
                  <span className="absolute bottom-[-2rem] right-[7px] top-7 hidden w-px bg-slate-300 sm:block" aria-hidden="true" />
                ) : null}
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                {group.sessions.map((session) => (
                  <HistorySessionCard
                    currentSessionId={currentSession.id}
                    historyLimit={historyLimit}
                    key={session.id}
                    sectionId={id}
                    session={session}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {hasMoreHistory ? (
          <div className="mt-6 flex justify-center">
            <Link className="secondary-button min-w-48" href={moreHistoryHref}>查看更多记录</Link>
          </div>
        ) : null}
      </section>

      {showHistoryDetails ? (
        <section className="panel mt-6 scroll-mt-6" id="history-detail">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-soft pb-4">
            <div>
              <p className="text-xs font-semibold text-teal">答题详情</p>
              <h2 className="mt-1 text-xl font-semibold text-ink">{formatDateTime(submittedAt)}</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">正确 {selectedCorrectAttempts.length} 题，错误 {selectedWrongAttempts.length} 题</p>
            </div>
            <Link className="secondary-button min-h-10 px-4" href={closeHistoryDetailsHref}>收起详情</Link>
          </div>

          <AttemptGroup attempts={selectedCorrectAttempts} title="做对的题" tone="correct" />
          <AttemptGroup attempts={selectedWrongAttempts} title="做错的题" tone="wrong" />
        </section>
      ) : null}
    </StudentPageShell>
  );
}

function HistorySessionCard({
  session,
  currentSessionId,
  sectionId,
  historyLimit
}: {
  session: SessionWithAttempts;
  currentSessionId: string;
  sectionId: string;
  historyLimit: number;
}) {
  const correctCount = session.correctCount || session.attempts.filter((attempt) => attempt.isCorrect).length;
  const totalCount = session.totalCount || session.attempts.length;
  const wrongCount = Math.max(0, totalCount - correctCount);
  const score = session.score ?? (totalCount ? Math.round((correctCount / totalCount) * 100) : 0);
  const scorePercent = Math.max(0, Math.min(100, score));
  const passed = score >= 80;
  const isCurrent = session.id === currentSessionId;
  const completedAt = session.completedAt || session.updatedAt;
  const detailsHref = buildHistoryHref({
    sectionId,
    sessionId: session.id,
    historyLimit,
    showDetails: true,
    anchor: "history-detail"
  });

  return (
    <article
      className={cn(
        "relative min-h-32 rounded-panel border bg-surface p-4 transition hover:-translate-y-0.5 hover:shadow-card",
        isCurrent ? "border-teal/70 ring-1 ring-teal/10" : "border-border-soft"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-slate-600">{formatHistoryDateTime(completedAt)}</p>
        <span className="badge bg-sky-50 text-sky-500">{getChallengeLabel(session)}</span>
      </div>

      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4">
        <div className="min-w-0">
          <p className={cn("text-2xl font-bold leading-none", passed ? "text-success-strong" : "text-coral")}>{score} 分</p>
          <p className="mt-2 text-sm font-semibold text-slate-600">正确 {correctCount} 题 · 错误 {wrongCount} 题</p>
          <div
            aria-label={`本次答题得分 ${scorePercent}%`}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={scorePercent}
            className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100"
            role="progressbar"
          >
            <div className={cn("h-full rounded-full", passed ? "bg-success" : "bg-coral")} style={{ width: `${scorePercent}%` }} />
          </div>
        </div>

        <Link
          aria-label={`查看 ${formatHistoryDateTime(completedAt)} 的答题详情`}
          className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-slate-700 transition hover:text-teal"
          href={detailsHref}
        >
          查看详情
          <ChevronRight size={16} />
        </Link>
      </div>
    </article>
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
      {tone === "wrong" ? <WrongQuestionAi questionId={attempt.questionId} sessionId={attempt.sessionId || undefined} /> : null}
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
