import { apiError, apiOk } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth";
import { getStudentLearningPath } from "@/lib/syllabus-learning";

function stripInternalQuestionScopes(path: Awaited<ReturnType<typeof getStudentLearningPath>>) {
  return {
    ...path,
    groups: path.groups.map((group) => ({
      ...group,
      courses: group.courses.map((course) => ({
        ...course,
        chapters: course.chapters.map((chapter) => ({
          ...chapter,
          sections: chapter.sections.map(({ questionSyllabusItemIds: _questionSyllabusItemIds, ...section }) => section)
        }))
      }))
    })),
    selectedGroup: path.selectedGroup
      ? {
          ...path.selectedGroup,
          courses: path.selectedGroup.courses.map((course) => ({
            ...course,
            chapters: course.chapters.map((chapter) => ({
              ...chapter,
              sections: chapter.sections.map(({ questionSyllabusItemIds: _questionSyllabusItemIds, ...section }) => section)
            }))
          }))
        }
      : null
  };
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return apiError("Authentication required.", 401, "UNAUTHORIZED");
  }

  const url = new URL(request.url);
  const courseType = url.searchParams.get("courseType") || url.searchParams.get("course");
  const path = await getStudentLearningPath(user.id, courseType);

  return apiOk(stripInternalQuestionScopes(path));
}
