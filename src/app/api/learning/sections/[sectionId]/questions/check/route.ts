import { revalidatePath } from "next/cache";
import { apiError, apiOk } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth";
import { bumpStudyStat } from "@/lib/learning";
import { prisma } from "@/lib/prisma";
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

  const selectedAnswer = toStoredAnswer(body.answer);
  const attempt = await prisma.questionAttempt.create({
    data: {
      userId: user.id,
      questionId: body.questionId,
      selectedAnswer,
      isCorrect: result.correct
    }
  });

  if (!result.correct) {
    await prisma.wrongQuestion.upsert({
      where: { userId_questionId: { userId: user.id, questionId: body.questionId } },
      update: { wrongCount: { increment: 1 }, lastWrongAt: new Date(), status: "active" },
      create: { userId: user.id, questionId: body.questionId, status: "active" }
    });
  }

  const diamondRewards = await bumpStudyStat(user.id, {
    questionsAnswered: 1,
    studySeconds: 60
  });
  revalidatePath("/me");

  return apiOk({ ...result, attemptId: attempt.id, diamondRewards });
}

function toStoredAnswer(answer: unknown) {
  const array = Array.isArray(answer) ? answer : [answer];
  return array.map((item) => String(item).trim()).filter(Boolean);
}
