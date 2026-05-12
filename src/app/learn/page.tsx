import Link from "next/link";
import { Flame, Gem, Heart, Zap } from "lucide-react";
import { LearningPath } from "@/components/learning-path";
import { StudentSidebar } from "@/components/student-sidebar";
import { requireUser } from "@/lib/auth";
import { ensureInitialProgress, repairUnlockedProgress } from "@/lib/learning";
import { prisma } from "@/lib/prisma";

type PointWithProgress = Awaited<ReturnType<typeof getLearningPoints>>[number];
type PointStatus = "locked" | "unlocked" | "passed";

const text = {
  dailyTask: "\u6bcf\u65e5\u7279\u522b\u4efb\u52a1",
  finishQuestions: "\u5b8c\u6210",
  questions: "\u9053\u9898",
  reviewReminder: "\u590d\u4e60\u63d0\u9192",
  current: "\u5f53\u524d\u6709",
  wrongPending: "\u9053\u9519\u9898\u7b49\u5f85\u638c\u63e1\u3002",
  review: "\u53bb\u590d\u4e60",
  empty: "\u5f53\u524d\u6ca1\u6709\u5df2\u53d1\u5e03\u7684\u5b66\u4e60\u5185\u5bb9\u3002"
};

async function getLearningPoints(userId: string) {
  return prisma.knowledgePoint.findMany({
    where: { status: "published", chapter: { status: "published" } },
    include: {
      chapter: true,
      progress: { where: { userId } },
      _count: { select: { questions: true } }
    },
    orderBy: [{ chapter: { sortOrder: "asc" } }, { sortOrder: "asc" }]
  });
}

function groupByChapter(points: PointWithProgress[]) {
  const groups = new Map<string, { id: string; title: string; sortOrder: number; points: PointWithProgress[] }>();

  for (const point of points) {
    const existing = groups.get(point.chapterId);
    if (existing) {
      existing.points.push(point);
    } else {
      groups.set(point.chapterId, {
        id: point.chapterId,
        title: point.chapter.title,
        sortOrder: point.chapter.sortOrder,
        points: [point]
      });
    }
  }

  return Array.from(groups.values()).sort((left, right) => left.sortOrder - right.sortOrder);
}

function pointStatus(point: PointWithProgress, index: number): PointStatus {
  return point.progress[0]?.status || (index === 0 ? "unlocked" : "locked");
}

function computeStreak(dates: Date[]) {
  const set = new Set(dates.map((date) => date.toISOString().slice(0, 10)));
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  let streak = 0;

  while (set.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

export default async function LearnPage({
  searchParams
}: {
  searchParams?: Promise<{ chapter?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  await ensureInitialProgress(user.id);
  await repairUnlockedProgress(user.id);

  const [points, stats, wrongCount] = await Promise.all([
    getLearningPoints(user.id),
    prisma.studyStat.findMany({ where: { userId: user.id }, orderBy: { date: "desc" }, take: 30 }),
    prisma.wrongQuestion.count({ where: { userId: user.id, status: "active" } })
  ]);

  const chapters = groupByChapter(points);
  const nextPoint = points.find((point, index) => pointStatus(point, index) === "unlocked");
  const requestedChapter = chapters.find((chapter) => chapter.id === params?.chapter);
  const currentChapter =
    requestedChapter ||
    chapters.find((chapter) => chapter.id === nextPoint?.chapterId) ||
    chapters.find((chapter) => chapter.points.some((point) => pointStatus(point, points.findIndex((item) => item.id === point.id)) !== "passed")) ||
    chapters.at(-1);
  const today = stats[0];
  const streak = computeStreak(stats.map((item) => item.date));
  const totalQuestions = stats.reduce((sum, item) => sum + item.questionsAnswered, 0);
  const totalXp = totalQuestions * 10;
  const dailyQuestionGoal = 5;
  const dailyQuestions = Math.min(today?.questionsAnswered || 0, dailyQuestionGoal);
  const dailyPercent = Math.round((dailyQuestions / dailyQuestionGoal) * 100);

  const chapterPath = currentChapter
    ? {
        id: currentChapter.id,
        title: currentChapter.title,
        sortOrder: currentChapter.sortOrder,
        passedCount: currentChapter.points.filter((point) => pointStatus(point, points.findIndex((item) => item.id === point.id)) === "passed").length,
        points: currentChapter.points.map((point) => ({
          id: point.id,
          title: point.title,
          questionCount: point._count.questions,
          status: pointStatus(point, points.findIndex((item) => item.id === point.id))
        }))
      }
    : null;

  return (
    <main className="min-h-dvh bg-mist lg:grid lg:grid-cols-[240px_minmax(0,1fr)_340px]">
      <StudentSidebar active="learn" />

      <section className="min-w-0 px-5 py-8 lg:px-8">
        {chapterPath ? <LearningPath chapter={chapterPath} /> : <div className="panel text-slate-600">{text.empty}</div>}
      </section>

      <aside className="hidden border-l border-slate-100 bg-mist/60 px-5 py-8 xl:block">
        <div className="sticky top-8 space-y-4">
          <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 text-sm font-black shadow-sm">
            <span className="flex items-center gap-2"><Flame className="text-orange-500" size={22} />{streak}</span>
            <span className="flex items-center gap-2"><Gem className="text-sky-500" size={22} />{totalXp}</span>
            <span className="flex items-center gap-2"><Heart className="fill-coral text-coral" size={22} />{Math.max(0, 5 - wrongCount)}</span>
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black">{text.dailyTask}</h2>
            <div className="mt-5 flex items-center gap-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-honey/20 text-honey">
                <Zap size={26} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex justify-between text-sm font-bold">
                  <span>{text.finishQuestions} {dailyQuestionGoal} {text.questions}</span>
                  <span className="text-slate-400">{dailyQuestions}/{dailyQuestionGoal}</span>
                </div>
                <div className="mt-2 h-3 rounded-full bg-slate-100">
                  <div className="h-3 rounded-full bg-honey" style={{ width: dailyPercent + "%" }} />
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black">{text.reviewReminder}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{text.current}<span className="font-black text-coral">{wrongCount}</span>{text.wrongPending}</p>
            <Link className="secondary-button mt-4 w-full" href="/wrong-book">{text.review}</Link>
          </section>
        </div>
      </aside>
    </main>
  );
}
