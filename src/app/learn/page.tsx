import Link from "next/link";
import { Check, Flame, Gem, Heart, Lock, Sparkles, Zap } from "lucide-react";
import { StudentSidebar } from "@/components/student-sidebar";
import { requireUser } from "@/lib/auth";
import { ensureInitialProgress, repairUnlockedProgress } from "@/lib/learning";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";

type PointWithProgress = Awaited<ReturnType<typeof getLearningPoints>>[number];
type PointStatus = "locked" | "unlocked" | "passed";

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

export default async function LearnPage() {
  const user = await requireUser();
  await ensureInitialProgress(user.id);
  await repairUnlockedProgress(user.id);

  const [points, stats, wrongCount] = await Promise.all([
    getLearningPoints(user.id),
    prisma.studyStat.findMany({ where: { userId: user.id }, orderBy: { date: "desc" }, take: 30 }),
    prisma.wrongQuestion.count({ where: { userId: user.id, status: "active" } })
  ]);

  const chapters = groupByChapter(points);
  const passedCount = points.filter((point, index) => pointStatus(point, index) === "passed").length;
  const nextPoint = points.find((point, index) => pointStatus(point, index) === "unlocked");
  const today = stats[0];
  const streak = computeStreak(stats.map((item) => item.date));
  const totalQuestions = stats.reduce((sum, item) => sum + item.questionsAnswered, 0);
  const totalXp = totalQuestions * 10;
  const dailyQuestionGoal = 5;
  const dailyQuestions = Math.min(today?.questionsAnswered || 0, dailyQuestionGoal);
  const dailyPercent = Math.round((dailyQuestions / dailyQuestionGoal) * 100);

  return (
    <main className="min-h-dvh bg-mist lg:grid lg:grid-cols-[240px_minmax(0,1fr)_340px]">
      <StudentSidebar active="learn" />

      <section className="min-w-0 px-5 py-8 lg:px-8">
        <section className="rounded-2xl bg-[#58cc02] p-5 text-white shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-white/80">江苏专转本 · 计算机</p>
              <h1 className="mt-1 text-2xl font-black">第 {nextPoint?.chapter.sortOrder || 1} 阶段，继续闯关</h1>
              <p className="mt-2 text-sm font-semibold text-white/90">{nextPoint ? `${nextPoint.chapter.title} / ${nextPoint.title}` : "当前内容已全部通过"}</p>
            </div>
            {nextPoint ? (
              <Link className="rounded-2xl border-2 border-black/10 bg-white px-5 py-3 text-sm font-black text-[#58cc02] shadow-[0_4px_0_rgba(0,0,0,0.12)] transition hover:-translate-y-0.5" href={`/learn/${nextPoint.id}`}>
                开始
              </Link>
            ) : (
              <span className="rounded-2xl bg-white/15 px-5 py-3 text-sm font-black">全部完成</span>
            )}
          </div>
        </section>

        <section className="mt-8 space-y-10">
          {chapters.map((chapter) => {
            const chapterPassed = chapter.points.filter((point) => pointStatus(point, points.findIndex((item) => item.id === point.id)) === "passed").length;
            return (
              <section key={chapter.id}>
                <div className="mb-6 flex items-center gap-4 text-slate-400">
                  <div className="h-px flex-1 bg-slate-200" />
                  <div className="text-center">
                    <p className="text-xs font-black uppercase tracking-wide">第 {chapter.sortOrder} 部分</p>
                    <h2 className="mt-1 text-lg font-black text-slate-500">{chapter.title}</h2>
                    <p className="mt-1 text-xs font-semibold">{chapterPassed}/{chapter.points.length} 已通过</p>
                  </div>
                  <div className="h-px flex-1 bg-slate-200" />
                </div>

                <div className="relative mx-auto flex max-w-md flex-col items-center gap-7">
                  {chapter.points.map((point, index) => {
                    const globalIndex = points.findIndex((item) => item.id === point.id);
                    const status = pointStatus(point, globalIndex);
                    const locked = status === "locked";
                    const isNext = nextPoint?.id === point.id;
                    const offset = index % 4 === 1 ? "-translate-x-12" : index % 4 === 2 ? "translate-x-12" : "";
                    return (
                      <div key={point.id} className={cn("relative flex w-full justify-center", offset)}>
                        {index < chapter.points.length - 1 ? <div className="absolute left-1/2 top-20 h-10 w-1 -translate-x-1/2 rounded-full bg-slate-200" /> : null}
                        <Link
                          href={locked ? "/learn" : `/learn/${point.id}`}
                          className={cn("group relative flex flex-col items-center text-center", locked && "cursor-not-allowed")}
                        >
                          {isNext ? (
                            <span className="mb-2 rounded-xl border-2 border-slate-200 bg-white px-4 py-1 text-sm font-black text-[#58cc02] shadow-sm">开始</span>
                          ) : null}
                          <span
                            className={cn(
                              "grid size-20 place-items-center rounded-full border-b-8 text-white transition",
                              status === "passed" && "border-[#45a000] bg-[#58cc02]",
                              status === "unlocked" && "border-[#45a000] bg-[#58cc02] group-hover:-translate-y-1",
                              locked && "border-slate-300 bg-slate-200 text-slate-400",
                              isNext && "ring-8 ring-[#58cc02]/20"
                            )}
                          >
                            {locked ? <Lock size={30} /> : status === "passed" ? <Check size={34} strokeWidth={4} /> : <Sparkles size={32} />}
                          </span>
                          <span className="mt-3 max-w-48 rounded-2xl bg-white px-3 py-2 text-sm font-bold text-ink shadow-sm ring-1 ring-slate-200">
                            {point.title}
                          </span>
                          <span className="mt-1 text-xs font-semibold text-slate-400">{point._count.questions} 题</span>
                        </Link>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </section>
      </section>

      <aside className="hidden border-l border-slate-100 bg-mist/60 px-5 py-8 xl:block">
        <div className="sticky top-8 space-y-4">
          <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 text-sm font-black shadow-sm">
            <span className="flex items-center gap-2"><Flame className="text-orange-500" size={22} />{streak}</span>
            <span className="flex items-center gap-2"><Gem className="text-sky-500" size={22} />{totalXp}</span>
            <span className="flex items-center gap-2"><Heart className="fill-coral text-coral" size={22} />{Math.max(0, 5 - wrongCount)}</span>
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black">每日特别任务</h2>
            <div className="mt-5 flex items-center gap-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-honey/20 text-honey">
                <Zap size={26} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex justify-between text-sm font-bold">
                  <span>完成 {dailyQuestionGoal} 道题</span>
                  <span className="text-slate-400">{dailyQuestions}/{dailyQuestionGoal}</span>
                </div>
                <div className="mt-2 h-3 rounded-full bg-slate-100">
                  <div className="h-3 rounded-full bg-honey" style={{ width: `${dailyPercent}%` }} />
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black">复习提醒</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">当前有 <span className="font-black text-coral">{wrongCount}</span> 道错题待掌握。</p>
            <Link className="secondary-button mt-4 w-full" href="/wrong-book">去复习</Link>
          </section>
        </div>
      </aside>
    </main>
  );
}

