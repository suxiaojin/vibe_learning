import { revalidatePath } from "next/cache";
import { apiError, apiOk } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth";
import { answersEqual } from "@/lib/learning";
import { getMockTestContext, normalizeMockTestCourseKey } from "@/lib/mock-tests";
import { isQuestionBankAutoGradedForOwner } from "@/lib/question-bank-types";
import { prisma } from "@/lib/prisma";

type AttemptPayload = {
  answer?: unknown;
  courseKey?: string;
  practiceRunId?: string;
  questionId?: string;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sectionId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return apiError("Authentication required.", 401, "UNAUTHORIZED");
  }

  const body = (await request.json().catch(() => null)) as AttemptPayload | null;
  const { sectionId } = await params;
  const selectedAnswer = normalizeSelectedAnswer(body?.answer);
  if (
    !body?.questionId ||
    !body.practiceRunId ||
    !/^[a-f0-9]{32}$/i.test(body.practiceRunId) ||
    selectedAnswer.length === 0
  ) {
    return apiError("Invalid special practice attempt.", 400, "INVALID_SPECIAL_PRACTICE_ATTEMPT");
  }

  const courseKey = normalizeMockTestCourseKey(body.courseKey);
  const context = await getMockTestContext(user.id, courseKey);
  const section = context.practiceSections.find((item) => item.id === sectionId);
  const question = section?.questions.find((item) => item.id === body.questionId);
  if (!context.group || !question) {
    return apiError("Special practice question is unavailable.", 404, "SPECIAL_PRACTICE_QUESTION_NOT_FOUND");
  }

  const autoGraded = isQuestionBankAutoGradedForOwner(
    question.type,
    context.group.key,
    context.group.name,
    question.fillBlankScored
  );
  const result = await prisma.questionAttempt.createMany({
    data: [{
      id: `sp_${user.id}_${body.practiceRunId}_${question.id}`,
      userId: user.id,
      questionId: question.id,
      sessionId: null,
      selectedAnswer,
      isCorrect: autoGraded && answersEqual(selectedAnswer, question.answer),
      gradingStatus: autoGraded ? "auto_graded" : "ungraded"
    }],
    skipDuplicates: true
  });

  if (result.count > 0) {
    revalidatePath("/me");
  }

  return apiOk({ recorded: result.count > 0 });
}

function normalizeSelectedAnswer(value: unknown) {
  const values = Array.isArray(value) ? value : [value];
  return values
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, 5000))
    .filter(Boolean)
    .slice(0, 20);
}
