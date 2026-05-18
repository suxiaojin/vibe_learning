import { apiError, apiOk } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth";
import { answersEqual, bumpStudyStat, canAccessKnowledgePoint, unlockNextPoint } from "@/lib/learning";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return apiError("Authentication required.", 401, "UNAUTHORIZED");
  }

  const body = (await request.json().catch(() => null)) as { pointId?: string; answers?: Record<string, string[]> } | null;
  if (!body?.pointId || !body.answers) {
    return apiError("Invalid payload", 400, "INVALID_PROGRESS_SUBMISSION");
  }

  const canAccess = await canAccessKnowledgePoint(user.id, body.pointId);
  if (!canAccess) {
    return apiError("Knowledge point is locked or unavailable", 403, "KNOWLEDGE_POINT_LOCKED");
  }

  const submittedAt = new Date();
  const questions = await prisma.question.findMany({
    where: { knowledgePointId: body.pointId, status: "published" },
    select: { id: true, answer: true }
  });

  let correct = 0;
  const wrongAttemptIds: string[] = [];
  for (const question of questions) {
    const selected = body.answers[question.id] || [];
    const isCorrect = answersEqual(selected, question.answer);
    if (isCorrect) {
      correct += 1;
    }

    const attempt = await prisma.questionAttempt.create({
      data: {
        userId: user.id,
        questionId: question.id,
        selectedAnswer: selected,
        isCorrect
      }
    });

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
  const current = await prisma.userProgress.findUnique({
    where: { userId_knowledgePointId: { userId: user.id, knowledgePointId: body.pointId } }
  });

  await prisma.userProgress.upsert({
    where: { userId_knowledgePointId: { userId: user.id, knowledgePointId: body.pointId } },
    update: {
      status: passed ? "passed" : current?.status || "unlocked",
      bestScore: Math.max(current?.bestScore || 0, score),
      passedAt: passed ? new Date() : current?.passedAt
    },
    create: {
      userId: user.id,
      knowledgePointId: body.pointId,
      status: passed ? "passed" : "unlocked",
      bestScore: score,
      passedAt: passed ? new Date() : null
    }
  });

  if (passed) {
    await unlockNextPoint(user.id, body.pointId);
  }

  await bumpStudyStat(user.id, {
    questionsAnswered: total,
    pointsPassed: passed ? 1 : 0,
    studySeconds: 60
  });

  const resultPath = `/learn/${body.pointId}/result?attemptIds=${wrongAttemptIds.join(",")}&score=${score}&correct=${correct}&total=${total}&submittedAt=${encodeURIComponent(submittedAt.toISOString())}`;
  return apiOk({ score, passed, correct, total, wrongAttemptIds, resultPath });
}
