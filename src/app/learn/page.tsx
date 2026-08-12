import { LearningCourseSwitcher, LearningPath, type PathCourse } from "@/components/learning-path";
import { StudentPageShell } from "@/components/student-page-shell";
import { requireUser } from "@/lib/auth";
import { getStudentLearningPath, type SyllabusPathGroup } from "@/lib/syllabus-learning";

const text = {
  empty: "\u5f53\u524d\u6ca1\u6709\u5df2\u53d1\u5e03\u7684\u95ef\u5173\u5185\u5bb9\u3002"
};

function selectLearningCourse(group: SyllabusPathGroup | null, requestedChapterId?: string) {
  if (!group) {
    return null;
  }

  const requested = group.courses.find((course) => course.chapters.some((chapter) => chapter.id === requestedChapterId));
  if (requested) {
    return requested;
  }

  const firstUnlocked = group.courses.find((course) =>
    course.chapters.some((chapter) => chapter.sections.some((section) => section.status === "unlocked"))
  );
  if (firstUnlocked) {
    return firstUnlocked;
  }

  const firstUnfinished = group.courses.find((course) =>
    course.chapters.some((chapter) => chapter.sections.some((section) => section.status !== "passed"))
  );
  return firstUnfinished || group.courses.at(-1) || null;
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
  const currentCourse = selectLearningCourse(currentGroup, params?.chapter);
  const requestedPointId = currentCourse?.chapters.find((chapter) => chapter.id === params?.chapter)?.sections[0]?.id;

  const coursePath = currentCourse
    ? {
        id: currentCourse.id,
        title: currentCourse.title,
        courseType: currentCourse.courseType
      }
    : null;
  const learningPath = currentCourse
    ? {
        passedCount: currentCourse.chapters.filter((chapter) => chapter.sections[0]?.status === "passed").length,
        points: currentCourse.chapters.flatMap((chapter) =>
          chapter.sections.map((section) => ({
            id: section.id,
            title: chapter.title,
            questionCount: section.questionCount,
            status: section.status
          }))
        )
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
    <StudentPageShell active="learn" maxWidthClassName="max-w-[1080px]">
      <div className="grid w-full gap-5 xl:grid-cols-[minmax(0,42rem)_180px] xl:items-start xl:justify-center xl:gap-8">
        <div className="min-w-0">
          {learningPath && coursePath ? (
            <LearningPath course={coursePath} initialPointId={requestedPointId} path={learningPath} />
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
    </StudentPageShell>
  );
}
