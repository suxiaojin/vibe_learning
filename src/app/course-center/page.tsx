import { CourseCenterForm, type CourseCenterOverview } from "@/components/course-center-form";
import { StudentPageShell } from "@/components/student-page-shell";
import { requireUser } from "@/lib/auth";
import { getFoundationOptions } from "@/lib/foundation";
import { getStudentLearningPath, type SyllabusPathGroup } from "@/lib/syllabus-learning";

export default async function CourseCenterPage() {
  const user = await requireUser();
  const learningPath = await getStudentLearningPath(user.id);
  const profile = learningPath.profile;
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
    <StudentPageShell active="course-center" maxWidthClassName="max-w-[1280px]">
      <CourseCenterForm
        initialOptions={options}
        currentProfile={currentProfile}
        overview={overview}
        initialDrawerOpen={!learningPath.completed}
      />
    </StudentPageShell>
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
      publishedCourseCount: group.courses.length,
      chapterCount: group.courses.reduce((total, course) => total + course.chapters.length, 0),
      sectionCount: totalSections,
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

  return {
    courses: courseCards
  };
}
