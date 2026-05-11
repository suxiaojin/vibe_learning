import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { answersEqual, bumpStudyStat, unlockNextPoint } from "@/lib/learning";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const user = await requireUser();
  const body = (await request.json()) as { pointId?: string; answers?: Record<string, string[]> };
  if (!body.pointId || !body.answers) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const questions = await prisma.question.findMany({
    where: { knowledgePointId: body.pointId, status: "published" },
    select: { id: true, answer: true }
  });

  let correct = 0;
  for (const question of questions) {
    const selected = body.answers[question.id] || [];
    const isCorrect = answersEqual(selected, question.answer);
    if (isCorrect) {
      correct += 1;
    }

    await prisma.questionAttempt.create({
      data: {
        userId: user.id,
        questionId: question.id,
        selectedAnswer: selected,
        isCorrect
      }
    });

    if (!isCorrect) {
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

  return NextResponse.json({ score, passed, correct, total });
}
