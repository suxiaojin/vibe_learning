import { apiError, apiOk } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSyllabusSectionQuestionForStudent } from "@/lib/syllabus-learning";

function parseQuestionIndex(request: Request) {
  const url = new URL(request.url);
  const rawIndex = Number(url.searchParams.get("index") || 0);
  return Number.isInteger(rawIndex) && rawIndex >= 0 ? rawIndex : 0;
}

function parseSessionId(request: Request) {
  return new URL(request.url).searchParams.get("sessionId") || undefined;
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
  const sessionId = parseSessionId(request);
  const result = await getSyllabusSectionQuestionForStudent(user.id, sectionId, parseQuestionIndex(request), sessionId);

  if (!result) {
    return apiError("Syllabus section is unavailable.", 404, "SYLLABUS_SECTION_NOT_FOUND");
  }
  if (!result.question) {
    return apiError("Question is unavailable.", 404, "SYLLABUS_SECTION_QUESTION_NOT_FOUND");
  }

  const { challengeVersionId: _challengeVersionId, questionSyllabusItemIds: _questionSyllabusItemIds, ...section } = result.section;
  const { sections: _sections, ...chapter } = result.chapter;
  const { chapters: _chapters, ...course } = result.course;
  const recordedAttempt = sessionId
    ? await prisma.questionAttempt.findFirst({
        where: {
          sessionId,
          userId: user.id,
          questionId: result.question.id,
          session: { is: { syllabusItemId: sectionId } }
        },
        select: {
          id: true,
          selectedAnswer: true,
          isCorrect: true,
          question: {
            select: { answer: true }
          }
        }
      })
    : null;
  const attempt = recordedAttempt
    ? {
        id: recordedAttempt.id,
        selectedAnswer: recordedAttempt.selectedAnswer,
        isCorrect: recordedAttempt.isCorrect,
        correctAnswer: recordedAttempt.question.answer
      }
    : null;

  return apiOk({ course, chapter, section, index: result.index, total: result.total, question: result.question, attempt });
}
