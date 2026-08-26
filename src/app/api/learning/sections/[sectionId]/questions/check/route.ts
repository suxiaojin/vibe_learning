import { revalidatePath } from "next/cache";
import { apiError, apiOk } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth";
import { answersEqual, bumpStudyStat } from "@/lib/learning";
import { prisma } from "@/lib/prisma";
import { isQuestionBankAutoGradedQuestionType } from "@/lib/question-bank-types";
import { getSyllabusSectionForStudent, getSyllabusSectionQuestionsForStudent, recordSyllabusSectionProgress } from "@/lib/syllabus-learning";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sectionId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return apiError("Authentication required.", 401, "UNAUTHORIZED");
  }

  const body = (await request.json().catch(() => null)) as { questionId?: string; answer?: unknown; sessionId?: string } | null;
  if (!body || !body.questionId || !Object.prototype.hasOwnProperty.call(body, "answer")) {
    return apiError("Invalid payload", 400, "INVALID_QUESTION_CHECK");
  }

  const { sectionId } = await params;
  const session = await getOrCreateQuizSession(user.id, sectionId, body.sessionId);
  const result = await getSyllabusSectionQuestionsForStudent(user.id, sectionId, true, session.id);
  const questionIndex = result?.questions.findIndex((item) => item.id === body.questionId) ?? -1;
  const question = questionIndex >= 0 ? result?.questions[questionIndex] : null;

  if (!result || !question || !("answer" in question)) {
    return apiError("Question is unavailable.", 404, "SYLLABUS_SECTION_QUESTION_NOT_FOUND");
  }

  const gradingStatus = isQuestionBankAutoGradedQuestionType(question.type) ? "auto_graded" : "ungraded";
  const correct = gradingStatus === "auto_graded" ? answersEqual(toStoredAnswer(body.answer), question.answer) : null;
  const existingAttempt = await prisma.questionAttempt.findFirst({
    where: {
      sessionId: session.id,
      userId: user.id,
      questionId: body.questionId
    },
    select: { id: true, isCorrect: true, gradingStatus: true }
  });

  if (existingAttempt) {
    return apiOk({
      questionId: question.id,
      correct: existingAttempt.gradingStatus === "auto_graded" ? existingAttempt.isCorrect : null,
      correctAnswer: question.answer,
      gradingStatus: existingAttempt.gradingStatus,
      attemptId: existingAttempt.id,
      sessionId: session.id,
      diamondRewards: []
    });
  }

  const selectedAnswer = toStoredAnswer(body.answer);
  const attempt = await prisma.questionAttempt.create({
    data: {
      userId: user.id,
      sessionId: session.id,
      questionId: body.questionId,
      selectedAnswer,
      isCorrect: correct ?? false,
      gradingStatus
    }
  });

  if (gradingStatus === "auto_graded" && !correct) {
    await prisma.wrongQuestion.upsert({
      where: { userId_questionId: { userId: user.id, questionId: body.questionId } },
      update: { wrongCount: { increment: 1 }, lastWrongAt: new Date(), status: "active" },
      create: { userId: user.id, questionId: body.questionId, status: "active" }
    });
  }

  const total = result.questions.length;
  const recordedCount = await prisma.questionAttempt.count({ where: { sessionId: session.id } });
  const completed = recordedCount >= total;
  const scoredTotal = completed
    ? await prisma.questionAttempt.count({ where: { sessionId: session.id, gradingStatus: "auto_graded" } })
    : 0;
  const correctCount = completed
    ? await prisma.questionAttempt.count({ where: { sessionId: session.id, gradingStatus: "auto_graded", isCorrect: true } })
    : 0;
  const score = completed && scoredTotal > 0 ? Math.round((correctCount / scoredTotal) * 100) : null;
  const passed = completed && (scoredTotal === 0 || (score || 0) >= 80);
  const newlyPassed = completed ? await recordSyllabusSectionProgress(user.id, sectionId, score, passed) : false;
  const diamondRewards = await bumpStudyStat(user.id, {
    questionsAnswered: 1,
    pointsPassed: newlyPassed ? 1 : 0,
    studySeconds: 60
  });
  const diamondRewardAmount = diamondRewards.reduce((sum, reward) => sum + reward.amount, 0);

  await prisma.quizSession.update({
    where: { id: session.id },
    data: {
      currentIndex: completed ? total : Math.min(questionIndex + 1, Math.max(0, total - 1)),
      status: completed ? "completed" : "in_progress",
      completedAt: completed ? new Date() : undefined,
      score: completed ? score : undefined,
      correctCount: completed ? correctCount : undefined,
      totalCount: completed ? scoredTotal : undefined,
      diamondRewardAmount: diamondRewardAmount > 0 ? { increment: diamondRewardAmount } : undefined
    }
  });

  revalidatePath("/me");

  return apiOk({
    questionId: question.id,
    correct,
    correctAnswer: question.answer,
    gradingStatus,
    attemptId: attempt.id,
    sessionId: session.id,
    completed,
    resultPath: completed ? `/learn/${sectionId}/result?sessionId=${session.id}` : null,
    diamondRewards
  });
}

function toStoredAnswer(answer: unknown) {
  const array = Array.isArray(answer) ? answer : [answer];
  return array.map((item) => String(item).trim()).filter(Boolean);
}

async function getOrCreateQuizSession(userId: string, sectionId: string, sessionId?: string) {
  if (sessionId) {
    const existing = await prisma.quizSession.findFirst({
      where: {
        id: sessionId,
        userId,
        syllabusItemId: sectionId,
        chapterChallengeVersionId: { not: null },
        status: "in_progress"
      }
    });

    if (existing) {
      return existing;
    }
  }

  const latest = await prisma.quizSession.findFirst({
    where: {
      userId,
      syllabusItemId: sectionId,
      chapterChallengeVersionId: { not: null },
      status: "in_progress"
    },
    orderBy: { updatedAt: "desc" }
  });

  if (latest) {
    return latest;
  }

  const access = await getSyllabusSectionForStudent(userId, sectionId);
  if (!access || access.locked || !access.section.challengeVersionId) {
    throw new Error("Published chapter challenge is unavailable");
  }
  return prisma.quizSession.create({
    data: {
      userId,
      syllabusItemId: sectionId,
      chapterChallengeVersionId: access.section.challengeVersionId
    }
  });
}
