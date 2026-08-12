import { revalidatePath } from "next/cache";
import { apiError, apiOk } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth";
import { answersEqual, bumpStudyStat } from "@/lib/learning";
import { recordSyllabusSectionProgress, getSyllabusSectionForStudent, getSyllabusSectionQuestionsForStudent } from "@/lib/syllabus-learning";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return apiError("Authentication required.", 401, "UNAUTHORIZED");
  }

  const body = (await request.json().catch(() => null)) as {
    sectionId?: string;
    answers?: Record<string, string[]>;
    recordedAttempts?: Record<string, string>;
    sessionId?: string;
  } | null;
  if (!body?.sectionId || !body.answers) {
    return apiError("Invalid payload", 400, "INVALID_PROGRESS_SUBMISSION");
  }

  const session = await getOrCreateQuizSession(user.id, body.sectionId, body.sessionId);
  const result = await getSyllabusSectionQuestionsForStudent(user.id, body.sectionId, true, session.id);
  if (!result) {
    return apiError("Syllabus section is locked or unavailable", 403, "SYLLABUS_SECTION_LOCKED");
  }

  const submittedAt = new Date();
  let correct = 0;
  let newlyRecordedQuestions = 0;
  const wrongAttemptIds: string[] = [];
  const questions = result.questions as Array<(typeof result.questions)[number] & { answer: unknown }>;
  for (const question of questions) {
    const existingAttempt = await prisma.questionAttempt.findFirst({
      where: {
        sessionId: session.id,
        userId: user.id,
        questionId: question.id
      },
      select: { id: true, isCorrect: true }
    });

    if (existingAttempt) {
      if (existingAttempt.isCorrect) {
        correct += 1;
      } else {
        wrongAttemptIds.push(existingAttempt.id);
      }
      continue;
    }

    const selected = body.answers[question.id] || [];
    const isCorrect = answersEqual(selected, question.answer);
    if (isCorrect) {
      correct += 1;
    }

    const attempt = await prisma.questionAttempt.create({
      data: {
        userId: user.id,
        sessionId: session.id,
        questionId: question.id,
        selectedAnswer: selected,
        isCorrect
      }
    });
    newlyRecordedQuestions += 1;

    if (!isCorrect) {
      wrongAttemptIds.push(attempt.id);
      await prisma.wrongQuestion.upsert({
        where: { userId_questionId: { userId: user.id, questionId: question.id } },
        update: { wrongCount: { increment: 1 }, lastWrongAt: new Date(), status: "active" },
        create: { userId: user.id, questionId: question.id, status: "active" }
      });
    }
  }

  const total = questions.length;
  const score = total === 0 ? 0 : Math.round((correct / total) * 100);
  const passed = score >= 80;

  const newlyPassed = await recordSyllabusSectionProgress(user.id, body.sectionId, score, passed);
  const diamondRewards = await bumpStudyStat(user.id, {
    questionsAnswered: newlyRecordedQuestions,
    pointsPassed: newlyPassed ? 1 : 0,
    studySeconds: 60
  });
  const diamondRewardAmount = diamondRewards.reduce((sum, reward) => sum + reward.amount, 0);
  await prisma.quizSession.update({
    where: { id: session.id },
    data: {
      status: "completed",
      completedAt: new Date(),
      currentIndex: total,
      score,
      correctCount: correct,
      totalCount: total,
      diamondRewardAmount: diamondRewardAmount > 0 ? { increment: diamondRewardAmount } : undefined
    }
  });
  revalidatePath("/me");

  const resultPath = `/learn/${body.sectionId}/result?sessionId=${session.id}`;
  return apiOk({ score, passed, correct, total, wrongAttemptIds, diamondRewards, sessionId: session.id, resultPath });
}

async function getOrCreateQuizSession(userId: string, sectionId: string, sessionId?: string) {
  if (sessionId) {
    const existing = await prisma.quizSession.findFirst({
      where: {
        id: sessionId,
        userId,
        syllabusItemId: sectionId,
        chapterChallengeVersionId: { not: null }
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
