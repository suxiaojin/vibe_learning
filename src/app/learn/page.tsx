import { LearningCourseSwitcher, LearningPath, type PathCourse } from "@/components/learning-path";
import { StudentSidebar } from "@/components/student-sidebar";
import { requireUser } from "@/lib/auth";
import { getStudentLearningPath, type SyllabusPathGroup } from "@/lib/syllabus-learning";

const text = {
  empty: "\u5f53\u524d\u6ca1\u6709\u5df2\u53d1\u5e03\u7684\u95ef\u5173\u5185\u5bb9\u3002"
};

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
  const pathState = await getStudentLearningPath(user.id, params?.course);

  const currentGroup = pathState.selectedGroup;
  const currentContext = selectLearningContext(currentGroup, params?.chapter);

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
    <main className="min-h-dvh bg-mist lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
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

    </main>
  );
}
