import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export function normalizeAnswer(value: unknown) {
  const array = Array.isArray(value) ? value : [value];
  return array
    .map((item) => String(item).trim())
    .filter(Boolean)
    .sort();
}

export function answersEqual(left: unknown, right: unknown) {
  return JSON.stringify(normalizeAnswer(left)) === JSON.stringify(normalizeAnswer(right));
}

export async function ensureInitialProgress(userId: string) {
  const points = await prisma.knowledgePoint.findMany({
    where: { status: "published", chapter: { status: "published", subject: { status: "published" } } },
    orderBy: [{ chapter: { sortOrder: "asc" } }, { sortOrder: "asc" }],
    select: { id: true }
  });

  if (points.length === 0) {
    return;
  }

  const existing = await prisma.userProgress.findMany({
    where: { userId },
    select: { knowledgePointId: true }
  });
  const existingIds = new Set(existing.map((item) => item.knowledgePointId));

  for (const [index, point] of points.entries()) {
    if (!existingIds.has(point.id)) {
      await prisma.userProgress.create({
        data: {
          userId,
          knowledgePointId: point.id,
          status: index === 0 ? "unlocked" : "locked"
        }
      });
    }
  }
}

export async function repairUnlockedProgress(userId: string) {
  const points = await prisma.knowledgePoint.findMany({
    where: { status: "published", chapter: { status: "published", subject: { status: "published" } } },
    orderBy: [{ chapter: { sortOrder: "asc" } }, { sortOrder: "asc" }],
    select: { id: true }
  });

  if (points.length === 0) {
    return;
  }

  const progress = await prisma.userProgress.findMany({
    where: { userId, knowledgePointId: { in: points.map((point) => point.id) } },
    select: { knowledgePointId: true, status: true }
  });
  const statusByPointId = new Map(progress.map((item) => [item.knowledgePointId, item.status]));
  const idsToUnlock = new Set<string>();

  if (statusByPointId.get(points[0].id) !== "passed") {
    idsToUnlock.add(points[0].id);
  }

  for (const [index, point] of points.entries()) {
    if (statusByPointId.get(point.id) !== "passed") {
      continue;
    }
    const next = points[index + 1];
    if (next && statusByPointId.get(next.id) !== "passed") {
      idsToUnlock.add(next.id);
    }
  }

  await Promise.all(
    Array.from(idsToUnlock).map((knowledgePointId) =>
      prisma.userProgress.upsert({
        where: { userId_knowledgePointId: { userId, knowledgePointId } },
        update: { status: "unlocked" },
        create: { userId, knowledgePointId, status: "unlocked" }
      })
    )
  );
}

export async function unlockNextPoint(userId: string, currentPointId: string) {
  const points = await prisma.knowledgePoint.findMany({
    where: { status: "published", chapter: { status: "published", subject: { status: "published" } } },
    orderBy: [{ chapter: { sortOrder: "asc" } }, { sortOrder: "asc" }],
    select: { id: true }
  });
  const currentIndex = points.findIndex((point) => point.id === currentPointId);
  const next = currentIndex >= 0 ? points[currentIndex + 1] : null;

  if (next) {
    await prisma.userProgress.upsert({
      where: { userId_knowledgePointId: { userId, knowledgePointId: next.id } },
      update: { status: "unlocked" },
      create: { userId, knowledgePointId: next.id, status: "unlocked" }
    });
  }
}

export async function syncLearningProgress(userId: string) {
  await ensureInitialProgress(userId);
  await repairUnlockedProgress(userId);
}

export async function canAccessKnowledgePoint(userId: string, knowledgePointId: string) {
  await syncLearningProgress(userId);

  const point = await prisma.knowledgePoint.findUnique({
    where: { id: knowledgePointId },
    select: {
      id: true,
      status: true,
      chapter: {
        select: {
          status: true,
          subject: { select: { status: true } }
        }
      },
      progress: {
        where: { userId },
        select: { status: true }
      }
    }
  });

  if (!point || point.status !== "published" || point.chapter.status !== "published" || point.chapter.subject.status !== "published") {
    return false;
  }

  const status = point.progress[0]?.status;
  return status === "unlocked" || status === "passed";
}

export async function canExplainQuestion(userId: string, questionId: string) {
  const [wrongQuestion, wrongAttempt] = await Promise.all([
    prisma.wrongQuestion.findUnique({
      where: { userId_questionId: { userId, questionId } },
      select: { id: true }
    }),
    prisma.questionAttempt.findFirst({
      where: { userId, questionId, isCorrect: false },
      select: { id: true }
    })
  ]);

  return Boolean(wrongQuestion || wrongAttempt);
}

export async function bumpStudyStat(
  userId: string,
  data: { questionsAnswered?: number; pointsPassed?: number; studySeconds?: number }
) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  await prisma.studyStat.upsert({
    where: { userId_date: { userId, date: today } },
    update: {
      questionsAnswered: { increment: data.questionsAnswered ?? 0 },
      pointsPassed: { increment: data.pointsPassed ?? 0 },
      studySeconds: { increment: data.studySeconds ?? 0 }
    },
    create: {
      userId,
      date: today,
      questionsAnswered: data.questionsAnswered ?? 0,
      pointsPassed: data.pointsPassed ?? 0,
      studySeconds: data.studySeconds ?? 0
    }
  });
}

export function parseJsonField(value: FormDataEntryValue | null, fallback: Prisma.InputJsonValue) {
  if (!value || typeof value !== "string") {
    return fallback;
  }
  try {
    return JSON.parse(value) as Prisma.InputJsonValue;
  } catch {
    return fallback;
  }
}
