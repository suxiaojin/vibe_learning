import { CourseCenterForm, type CourseCenterOverview } from "@/components/course-center-form";
import { StudentPageShell } from "@/components/student-page-shell";
import { requireUser } from "@/lib/auth";
import { getFoundationOptions } from "@/lib/foundation";
import { getStudentLearningPath, type SyllabusPathGroup } from "@/lib/syllabus-learning";
import { prisma } from "@/lib/prisma";

export default async function CourseCenterPage() {
  const user = await requireUser();
  const learningPath = await getStudentLearningPath(user.id);
  const profile = learningPath.profile;
  const planState = await prisma.studentProfile.findUnique({
    where: { userId: user.id },
    select: { foundationPlanConfirmedAt: true }
  });
  let options = await getFoundationOptions(profile?.regionId || undefined).catch(() => null);

  if (!options) {
    options = await getFoundationOptions();
  }

  const majorIcon = profile?.majorId
    ? await prisma.major.findUnique({ where: { id: profile.majorId }, select: { courseCenterIconKey: true } })
    : null;
  const majorIconUrl = profile?.majorId && majorIcon?.courseCenterIconKey
    ? `/api/course-center/major-icons/${encodeURIComponent(profile.majorId)}?v=${encodeURIComponent(majorIcon.courseCenterIconKey)}`
    : null;

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
  const isHenanEnglish = profile?.region?.province === "河南" && profile.region.studySystem === "三年制" && profile.publicSubject?.name === "公共英语";
  const englishPapers = isHenanEnglish ? await prisma.examPaper.findMany({
    where: {
      regionId: profile.regionId!,
      publicSubjectId: profile.publicSubjectId!,
      ownerType: "public_subject",
      status: "published"
    },
    orderBy: [{ year: { sort: "desc", nulls: "last" } }, { sortOrder: "asc" }, { createdAt: "asc" }],
    take: 3,
    select: { id: true, title: true }
  }) : null;

  if (isHenanEnglish && !overview.courses.some((course) => course.key === "public_subject")) {
    overview.courses.unshift({
      key: "public_subject", title: profile.publicSubject?.name || "公共英语", publishedCourseCount: 0,
      chapterCount: 0, sectionCount: 0, progressPercent: 0, currentSection: null, upcomingSections: []
    });
  }

  return (
    <StudentPageShell active="course-center" maxWidthClassName="max-w-[1280px]">
      <CourseCenterForm
        initialOptions={options}
        currentProfile={currentProfile}
        overview={overview}
        englishPapers={englishPapers}
        majorIconUrl={majorIconUrl}
        planConfirmed={Boolean(planState?.foundationPlanConfirmedAt)}
        initialDrawerOpen={!learningPath.completed && !planState?.foundationPlanConfirmedAt}
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
