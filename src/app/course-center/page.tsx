import { StudentSidebar } from "@/components/student-sidebar";
import { CourseCenterForm, type CourseCenterOverview } from "@/components/course-center-form";
import { requireUser } from "@/lib/auth";
import { getFoundationOptions, getStudentFoundationProfile } from "@/lib/foundation";
import { getStudentLearningPath, type SyllabusPathGroup } from "@/lib/syllabus-learning";

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

export default async function CourseCenterPage() {
  const user = await requireUser();
  const [profile, learningPath] = await Promise.all([
    getStudentFoundationProfile(user.id),
    getStudentLearningPath(user.id)
  ]);
  let options = await getFoundationOptions(profile?.regionId || undefined).catch(() => null);

  if (!options) {
    options = await getFoundationOptions();
  }

  const currentProfile = profile
    ? {
        regionId: profile.regionId,
        publicSubjectId: profile.publicSubjectId,
        majorId: profile.majorId,
        regionName: profile.region?.name || "",
        province: profile.region?.province || "",
        studySystem: profile.region?.studySystem || "",
        publicSubjectName: profile.publicSubject?.name || "",
        majorName: profile.major?.name || ""
      }
    : null;
  const overview = buildCourseCenterOverview(learningPath.groups);

  return (
    <main className="min-h-dvh bg-mist lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
      <StudentSidebar active="course-center" />

      <section className="min-w-0 px-5 py-8 lg:px-8 xl:px-10">
        <div className="mx-auto w-full max-w-[1280px]">
          <CourseCenterForm initialOptions={options} currentProfile={currentProfile} overview={overview} />
        </div>
      </section>
    </main>
  );
}

function buildCourseCenterOverview(groups: SyllabusPathGroup[]): CourseCenterOverview {
  const courseCards = groups.map((group) => {
    const sections = group.courses.flatMap((course) =>
      course.chapters.flatMap((chapter) =>
        chapter.sections.map((section) => ({
          ...section,
          chapterId: chapter.id,
          chapterTitle: chapter.title,
          courseTitle: course.title
        }))
      )
    );
    const passedSections = sections.filter((section) => section.status === "passed");
    const currentIndex = sections.findIndex((section) => section.status === "unlocked");
    const currentSection = currentIndex >= 0 ? sections[currentIndex] : sections.at(-1) || null;
    const upcomingSections = sections
      .filter((section, index) => index > currentIndex && section.status !== "passed")
      .slice(0, 3)
      .map((section) => ({
        id: section.id,
        title: section.title,
        status: section.status,
        href: `/learn?course=${group.key}&chapter=${section.chapterId}`
      }));
    const totalSections = sections.length;

    return {
      key: group.key,
      title: group.name,
      chapterCount: group.courses.reduce((total, course) => total + course.chapters.length, 0),
      sectionCount: totalSections,
      passedCount: passedSections.length,
      progressPercent: totalSections ? Math.round((passedSections.length / totalSections) * 100) : 0,
      currentSection: currentSection
        ? {
            title: currentSection.title,
            chapterTitle: currentSection.chapterTitle,
            href: `/learn?course=${group.key}&chapter=${currentSection.chapterId}`
          }
        : null,
      upcomingSections
    };
  });

  const completedSections = groups
    .flatMap((group) =>
      group.courses.flatMap((course) =>
        course.chapters.flatMap((chapter) =>
          chapter.sections
            .filter((section) => section.status === "passed" && section.passedAt)
            .map((section) => ({
              id: section.id,
              title: section.title,
              courseTitle: group.name,
              passedAt: section.passedAt as Date
            }))
        )
      )
    )
    .sort((left, right) => right.passedAt.getTime() - left.passedAt.getTime());
  const week = buildCurrentWeek(completedSections.map((section) => section.passedAt));

  return {
    courses: courseCards,
    week,
    recentActivities: completedSections.slice(0, 3).map((section) => ({
      id: section.id,
      title: section.title,
      courseTitle: section.courseTitle,
      completedAt: section.passedAt.toISOString()
    }))
  };
}

function buildCurrentWeek(completedDates: Date[]) {
  const now = new Date();
  const beijingNow = new Date(now.getTime() + BEIJING_OFFSET_MS);
  const weekday = beijingNow.getUTCDay() || 7;
  const monday = new Date(
    Date.UTC(beijingNow.getUTCFullYear(), beijingNow.getUTCMonth(), beijingNow.getUTCDate() - weekday + 1) - BEIJING_OFFSET_MS
  );
  const countsByDay = new Map<string, number>();

  for (const date of completedDates) {
    const key = beijingDateKey(date);
    countsByDay.set(key, (countsByDay.get(key) || 0) + 1);
  }

  const labels = ["一", "二", "三", "四", "五", "六", "日"];
  const days = labels.map((label, index) => {
    const date = new Date(monday.getTime() + index * 24 * 60 * 60 * 1000);
    const key = beijingDateKey(date);

    return {
      key,
      label,
      count: countsByDay.get(key) || 0,
      isToday: key === beijingDateKey(now)
    };
  });

  return {
    days,
    completedCount: days.reduce((total, day) => total + day.count, 0),
    activeDays: days.filter((day) => day.count > 0).length
  };
}

function beijingDateKey(date: Date) {
  const shifted = new Date(date.getTime() + BEIJING_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
