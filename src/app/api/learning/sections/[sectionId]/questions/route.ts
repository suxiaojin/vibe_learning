import { apiError, apiOk } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth";
import { getSyllabusSectionQuestionForStudent } from "@/lib/syllabus-learning";

function parseQuestionIndex(request: Request) {
  const url = new URL(request.url);
  const rawIndex = Number(url.searchParams.get("index") || 0);
  return Number.isInteger(rawIndex) && rawIndex >= 0 ? rawIndex : 0;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sectionId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return apiError("Authentication required.", 401, "UNAUTHORIZED");
  }

  const { sectionId } = await params;
  const result = await getSyllabusSectionQuestionForStudent(user.id, sectionId, parseQuestionIndex(request));

  if (!result) {
    return apiError("Syllabus section is unavailable.", 404, "SYLLABUS_SECTION_NOT_FOUND");
  }
  if (!result.question) {
    return apiError("Question is unavailable.", 404, "SYLLABUS_SECTION_QUESTION_NOT_FOUND");
  }

  const { questionSyllabusItemIds: _questionSyllabusItemIds, ...section } = result.section;
  const { sections: _sections, ...chapter } = result.chapter;
  const { chapters: _chapters, ...course } = result.course;
  return apiOk({ course, chapter, section, index: result.index, total: result.total, question: result.question });
}
