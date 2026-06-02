import { revalidatePath } from "next/cache";
import { apiError, apiOk } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth";
import { answersEqual, bumpStudyStat } from "@/lib/learning";
import { prisma } from "@/lib/prisma";
import { getSyllabusSectionQuestionsForStudent, recordSyllabusSectionProgress } from "@/lib/syllabus-learning";

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
  const result = await getSyllabusSectionQuestionsForStudent(user.id, sectionId, true);
  const questionIndex = result?.questions.findIndex((item) => item.id === body.questionId) ?? -1;
  const question = questionIndex >= 0 ? result?.questions[questionIndex] : null;

  if (!result || !question || !("answer" in question)) {
    return apiError("Question is unavailable.", 404, "SYLLABUS_SECTION_QUESTION_NOT_FOUND");
  }

  const session = await getOrCreateQuizSession(user.id, sectionId, body.sessionId);
  const correct = answersEqual(toStoredAnswer(body.answer), question.answer);
  const existingAttempt = await prisma.questionAttempt.findFirst({
    where: {
      sessionId: session.id,
      userId: user.id,
      questionId: body.questionId
    },
    select: { id: true, isCorrect: true }
  });

  if (existingAttempt) {
    return apiOk({
      questionId: question.id,
      correct: existingAttempt.isCorrect,
      correctAnswer: question.answer,
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
      isCorrect: correct
    }
  });

  if (!correct) {
    await prisma.wrongQuestion.upsert({
      where: { userId_questionId: { userId: user.id, questionId: body.questionId } },
      update: { wrongCount: { increment: 1 }, lastWrongAt: new Date(), status: "active" },
      create: { userId: user.id, questionId: body.questionId, status: "active" }
    });
  }

  const total = result.questions.length;
  const recordedCount = await prisma.questionAttempt.count({ where: { sessionId: session.id } });
  const completed = recordedCount >= total;
  const correctCount = completed
    ? await prisma.questionAttempt.count({ where: { sessionId: session.id, isCorrect: true } })
    : 0;
  const score = completed && total > 0 ? Math.round((correctCount / total) * 100) : null;
  const newlyPassed = completed ? await recordSyllabusSectionProgress(user.id, sectionId, score || 0, (score || 0) >= 80) : false;
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
      totalCount: completed ? total : undefined,
      diamondRewardAmount: diamondRewardAmount > 0 ? { increment: diamondRewardAmount } : undefined
    }
  });

  revalidatePath("/me");

  return apiOk({
    questionId: question.id,
    correct,
    correctAnswer: question.answer,
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
      status: "in_progress"
    },
    orderBy: { updatedAt: "desc" }
  });

  if (latest) {
    return latest;
  }

  return prisma.quizSession.create({
    data: {
      userId,
      syllabusItemId: sectionId
    }
  });
}
