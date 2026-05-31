import { apiError, apiOk } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth";
import { getSyllabusSectionQuestionsForStudent } from "@/lib/syllabus-learning";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sectionId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return apiError("Authentication required.", 401, "UNAUTHORIZED");
  }

  const { sectionId } = await params;
  const result = await getSyllabusSectionQuestionsForStudent(user.id, sectionId);

  if (!result) {
    return apiError("Syllabus section is unavailable.", 404, "SYLLABUS_SECTION_NOT_FOUND");
  }

  const { questionSyllabusItemIds: _questionSyllabusItemIds, ...section } = result.section;
  const { sections: _sections, ...chapter } = result.chapter;
  const { chapters: _chapters, ...course } = result.course;
  return apiOk({ course, chapter, section, questions: result.questions });
}
