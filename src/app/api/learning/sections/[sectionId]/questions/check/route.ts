import { apiError, apiOk } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth";
import { checkSyllabusSectionQuestionAnswer } from "@/lib/syllabus-learning";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sectionId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return apiError("Authentication required.", 401, "UNAUTHORIZED");
  }

  const body = (await request.json().catch(() => null)) as { questionId?: string; answer?: unknown } | null;
  if (!body || !body.questionId || !Object.prototype.hasOwnProperty.call(body, "answer")) {
    return apiError("Invalid payload", 400, "INVALID_QUESTION_CHECK");
  }

  const { sectionId } = await params;
  const result = await checkSyllabusSectionQuestionAnswer(user.id, sectionId, body.questionId, body.answer);

  if (!result) {
    return apiError("Question is unavailable.", 404, "SYLLABUS_SECTION_QUESTION_NOT_FOUND");
  }

  return apiOk(result);
}
