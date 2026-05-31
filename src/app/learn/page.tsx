import Link from "next/link";
import { Flame, Gem, Heart, Zap } from "lucide-react";
import { LearningCourseSwitcher, LearningPath, type PathCourse } from "@/components/learning-path";
import { StudentSidebar } from "@/components/student-sidebar";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStudentLearningPath, type SyllabusPathGroup } from "@/lib/syllabus-learning";

const text = {
  dailyTask: "\u6bcf\u65e5\u7279\u522b\u4efb\u52a1",
  finishQuestions: "\u5b8c\u6210",
  questions: "\u9053\u9898",
  reviewReminder: "\u590d\u4e60\u63d0\u9192",
  current: "\u5f53\u524d\u6709",
  wrongPending: "\u9053\u9519\u9898\u7b49\u5f85\u638c\u63e1\u3002",
  review: "\u53bb\u590d\u4e60",
  empty: "\u5f53\u524d\u6ca1\u6709\u5df2\u53d1\u5e03\u7684\u95ef\u5173\u5185\u5bb9\u3002"
};

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

function selectLearningContext(group: SyllabusPathGroup | null, requestedChapterId?: string) {
  if (!group) {
    return null;
  }

  const contexts = group.courses.flatMap((course) =>
    course.chapters.map((chapter) => ({
      course,
      chapter
    }))
  );
  const requested = contexts.find((context) => context.chapter.id === requestedChapterId);
  if (requested) {
    return requested;
  }

  const firstUnlocked = contexts.find((context) => context.chapter.sections.some((section) => section.status === "unlocked"));
  if (firstUnlocked) {
    return firstUnlocked;
  }

  const firstUnfinished = contexts.find((context) => context.chapter.sections.some((section) => section.status !== "passed"));
  return firstUnfinished || contexts.at(-1) || null;
}

export default async function LearnPage({
  searchParams
}: {
  searchParams?: Promise<{ chapter?: string; course?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const [pathState, stats, wrongCount] = await Promise.all([
    getStudentLearningPath(user.id, params?.course),
    prisma.studyStat.findMany({ where: { userId: user.id }, orderBy: { date: "desc" }, take: 30 }),
    prisma.wrongQuestion.count({ where: { userId: user.id, status: "active" } })
  ]);

  const currentGroup = pathState.selectedGroup;
  const currentContext = selectLearningContext(currentGroup, params?.chapter);
  const today = stats[0];
  const streak = computeStreak(stats.map((item) => item.date));
  const totalQuestions = stats.reduce((sum, item) => sum + item.questionsAnswered, 0);
  const totalXp = totalQuestions * 10;
  const dailyQuestionGoal = 5;
  const dailyQuestions = Math.min(today?.questionsAnswered || 0, dailyQuestionGoal);
  const dailyPercent = Math.round((dailyQuestions / dailyQuestionGoal) * 100);

  const coursePath = currentContext
    ? {
        id: currentContext.course.id,
        title: currentContext.course.title,
        courseType: currentContext.course.courseType
      }
    : null;
  const chapterPath = currentContext
    ? {
        id: currentContext.chapter.id,
        title: currentContext.chapter.title,
        sortOrder: currentContext.chapter.sortOrder,
        passedCount: currentContext.chapter.passedCount,
        points: currentContext.chapter.sections.map((section) => ({
          id: section.id,
          title: section.title,
          questionCount: section.questionCount,
          status: section.status
        }))
      }
    : null;
  const courseSwitcher = currentGroup
    ? {
        activeCourseId: currentGroup.key,
        courses: pathState.groups.map(
          (group): PathCourse => ({
            id: group.key,
            name: group.name,
            courseType: group.key
          })
        )
      }
    : null;

  return (
    <main className="min-h-dvh bg-mist lg:grid lg:grid-cols-[240px_minmax(0,1fr)_340px]">
      <StudentSidebar active="learn" />

      <section className="min-w-0 px-5 py-8 lg:px-8">
        <div className="mx-auto grid w-full max-w-[1080px] gap-5 xl:grid-cols-[minmax(0,42rem)_180px] xl:items-start xl:justify-center xl:gap-8">
          <div className="min-w-0">
            {chapterPath && coursePath ? (
              <LearningPath course={coursePath} chapter={chapterPath} />
            ) : pathState.completed ? (
              <div className="mx-auto max-w-2xl pb-24">
                <div className="panel text-slate-600">{text.empty}</div>
              </div>
            ) : null}
          </div>
          {courseSwitcher ? (
            <div className="order-first flex min-w-0 justify-end xl:order-none xl:sticky xl:top-10 xl:z-30 xl:justify-start">
              <LearningCourseSwitcher {...courseSwitcher} />
            </div>
          ) : null}
        </div>
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
