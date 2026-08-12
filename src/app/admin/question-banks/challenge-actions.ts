"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const statisticsPath = "/admin/question-banks/statistics";

async function getChapterScope(chapterId: string) {
  const chapter = await prisma.syllabusItem.findFirstOrThrow({
    where: { id: chapterId, parentId: null },
    select: {
      id: true,
      courseId: true,
      course: { select: { status: true } }
    }
  });
  const items = await prisma.syllabusItem.findMany({
    where: { courseId: chapter.courseId },
    select: { id: true, parentId: true }
  });
  const childrenByParentId = new Map<string, string[]>();
  for (const item of items) {
    if (!item.parentId) {
      continue;
    }
    const children = childrenByParentId.get(item.parentId) || [];
    children.push(item.id);
    childrenByParentId.set(item.parentId, children);
  }
  const syllabusItemIds: string[] = [];
  const stack = [chapter.id];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    syllabusItemIds.push(current);
    stack.push(...(childrenByParentId.get(current) || []));
  }
  return { ...chapter, syllabusItemIds };
}

async function ensureDraft(chapterId: string) {
  const existing = await prisma.chapterChallengeVersion.findFirst({
    where: { chapterId, status: "draft" },
    include: { questions: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
    orderBy: { version: "desc" }
  });
  if (existing) {
    return existing;
  }

  const latest = await prisma.chapterChallengeVersion.findFirst({
    where: { chapterId, status: { in: ["draft", "published"] } },
    include: { questions: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
    orderBy: { version: "desc" }
  });
  return prisma.chapterChallengeVersion.create({
    data: {
      chapterId,
      version: (latest?.version || 0) + 1,
      targetQuestionCount: latest?.targetQuestionCount || 10
    },
    include: { questions: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } }
  });
}

async function getEditableDraft(chapterId: string, challengeVersionId: string) {
  if (!challengeVersionId) {
    return ensureDraft(chapterId);
  }
  return prisma.chapterChallengeVersion.findFirstOrThrow({
    where: { id: challengeVersionId, chapterId, status: "draft" },
    include: { questions: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } }
  });
}

async function getExistingChallenge(chapterId: string, challengeVersionId: string) {
  return prisma.chapterChallengeVersion.findFirstOrThrow({
    where: { id: challengeVersionId, chapterId, status: { in: ["draft", "published"] } },
    include: { questions: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } }
  });
}

async function getActiveChallenge(chapterId: string, challengeVersionId: string) {
  return challengeVersionId
    ? getExistingChallenge(chapterId, challengeVersionId)
    : ensureDraft(chapterId);
}

async function assertQuestionCanEnterChapter(chapterId: string, questionId: string) {
  const chapter = await getChapterScope(chapterId);
  await prisma.question.findFirstOrThrow({
    where: {
      id: questionId,
      status: "published",
      knowledgeTags: { some: { syllabusItemId: { in: chapter.syllabusItemIds } } },
      paperQuestions: {
        some: {
          paper: {
            courseId: chapter.courseId,
            status: "published"
          }
        }
      }
    },
    select: { id: true }
  });
}

async function assertQuestionIsUnusedByOtherChallenge(chapterId: string, challengeVersionId: string, questionId: string) {
  const existing = await prisma.chapterChallengeQuestion.findFirst({
    where: {
      questionId,
      challengeVersionId: { not: challengeVersionId },
      challengeVersion: { chapterId, status: { in: ["draft", "published"] } }
    },
    select: { challengeVersion: { select: { version: true } } }
  });
  if (existing) {
    throw new Error(`Question is already used by challenge ${existing.challengeVersion.version}`);
  }
}

function refreshChallengePages(chapterId: string) {
  revalidatePath(statisticsPath);
  revalidatePath("/learn");
  revalidatePath("/course-center");
  revalidatePath(`/learn/${chapterId}`);
}

export async function addQuestionToChapterChallenge(formData: FormData) {
  await requireAdmin();
  const chapterId = String(formData.get("chapterId") || "");
  const challengeVersionId = String(formData.get("challengeVersionId") || "");
  const questionId = String(formData.get("questionId") || "");
  await assertQuestionCanEnterChapter(chapterId, questionId);
  const challenge = await getActiveChallenge(chapterId, challengeVersionId);
  if (challenge.questions.some((item) => item.questionId === questionId)) {
    refreshChallengePages(chapterId);
    return;
  }
  if (challenge.questions.length >= challenge.targetQuestionCount) {
    throw new Error("Challenge already has the configured number of questions");
  }
  await assertQuestionIsUnusedByOtherChallenge(chapterId, challenge.id, questionId);
  await prisma.chapterChallengeQuestion.create({
    data: {
      challengeVersionId: challenge.id,
      questionId,
      sortOrder: challenge.questions.length + 1
    }
  });
  refreshChallengePages(chapterId);
}

export async function removeQuestionFromChapterChallenge(formData: FormData) {
  await requireAdmin();
  const chapterId = String(formData.get("chapterId") || "");
  const challengeVersionId = String(formData.get("challengeVersionId") || "");
  const questionId = String(formData.get("questionId") || "");
  await getChapterScope(chapterId);
  const draft = await getExistingChallenge(chapterId, challengeVersionId);
  await prisma.chapterChallengeQuestion.deleteMany({
    where: { challengeVersionId: draft.id, questionId }
  });
  const remaining = await prisma.chapterChallengeQuestion.findMany({
    where: { challengeVersionId: draft.id },
    select: { id: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
  });
  await prisma.$transaction(
    remaining.map((item, index) =>
      prisma.chapterChallengeQuestion.update({ where: { id: item.id }, data: { sortOrder: index + 1 } })
    )
  );
  refreshChallengePages(chapterId);
}

export async function moveChapterChallengeQuestion(formData: FormData) {
  await requireAdmin();
  const chapterId = String(formData.get("chapterId") || "");
  const challengeVersionId = String(formData.get("challengeVersionId") || "");
  const questionId = String(formData.get("questionId") || "");
  const direction = String(formData.get("direction") || "");
  await getChapterScope(chapterId);
  const draft = await getExistingChallenge(chapterId, challengeVersionId);
  const index = draft.questions.findIndex((item) => item.questionId === questionId);
  const swapIndex = direction === "up" ? index - 1 : direction === "down" ? index + 1 : index;
  if (index >= 0 && swapIndex >= 0 && swapIndex < draft.questions.length && swapIndex !== index) {
    const current = draft.questions[index];
    const swap = draft.questions[swapIndex];
    await prisma.$transaction([
      prisma.chapterChallengeQuestion.update({ where: { id: current.id }, data: { sortOrder: swap.sortOrder } }),
      prisma.chapterChallengeQuestion.update({ where: { id: swap.id }, data: { sortOrder: current.sortOrder } })
    ]);
  }
  refreshChallengePages(chapterId);
}

export async function updateChapterChallengeTarget(formData: FormData) {
  await requireAdmin();
  const chapterId = String(formData.get("chapterId") || "");
  const challengeVersionId = String(formData.get("challengeVersionId") || "");
  const targetQuestionCount = Number(formData.get("targetQuestionCount") || 10);
  if (!Number.isInteger(targetQuestionCount) || targetQuestionCount < 1 || targetQuestionCount > 100) {
    throw new Error("Challenge question count must be between 1 and 100");
  }
  await getChapterScope(chapterId);
  const challenge = await getActiveChallenge(chapterId, challengeVersionId);
  await prisma.chapterChallengeVersion.update({
    where: { id: challenge.id },
    data: { targetQuestionCount }
  });
  refreshChallengePages(chapterId);
}

export async function deleteChapterChallenge(formData: FormData) {
  await requireAdmin();
  const chapterId = String(formData.get("chapterId") || "");
  const challengeVersionId = String(formData.get("challengeVersionId") || "");
  await getChapterScope(chapterId);

  await prisma.$transaction(async (transaction) => {
    const challenge = await transaction.chapterChallengeVersion.findFirstOrThrow({
      where: {
        id: challengeVersionId,
        chapterId,
        status: { in: ["draft", "published"] }
      },
      select: { id: true, status: true }
    });
    const versions = await transaction.chapterChallengeVersion.findMany({
      where: { chapterId },
      select: { version: true }
    });
    const minimumVersion = versions.reduce((minimum, item) => Math.min(minimum, item.version), 0);

    if (challenge.status === "published") {
      await transaction.chapterChallengeVersion.update({
        where: { id: challenge.id },
        data: { status: "archived", version: minimumVersion - 1 }
      });
    } else {
      await transaction.chapterChallengeVersion.delete({ where: { id: challenge.id } });
    }

    const archivedChallenges = await transaction.chapterChallengeVersion.findMany({
      where: { chapterId, status: "archived" },
      select: { id: true },
      orderBy: { version: "asc" }
    });
    const archivedVersionBase = minimumVersion - archivedChallenges.length - 1;
    for (const [index, archivedChallenge] of archivedChallenges.entries()) {
      await transaction.chapterChallengeVersion.update({
        where: { id: archivedChallenge.id },
        data: { version: archivedVersionBase - index }
      });
    }

    const activeChallenges = await transaction.chapterChallengeVersion.findMany({
      where: { chapterId, status: { in: ["draft", "published"] } },
      select: { id: true },
      orderBy: { version: "asc" }
    });
    const temporaryVersionBase = archivedVersionBase - archivedChallenges.length - activeChallenges.length - 2;

    for (const [index, activeChallenge] of activeChallenges.entries()) {
      await transaction.chapterChallengeVersion.update({
        where: { id: activeChallenge.id },
        data: { version: temporaryVersionBase - index }
      });
    }
    for (const [index, activeChallenge] of activeChallenges.entries()) {
      await transaction.chapterChallengeVersion.update({
        where: { id: activeChallenge.id },
        data: { version: index + 1 }
      });
    }
  });

  await ensureDraft(chapterId);
  refreshChallengePages(chapterId);
}

export async function saveChapterChallenge(formData: FormData) {
  await requireAdmin();
  const chapterId = String(formData.get("chapterId") || "");
  const challengeVersionId = String(formData.get("challengeVersionId") || "");
  const chapter = await getChapterScope(chapterId);
  const draft = await getEditableDraft(chapterId, challengeVersionId);
  if (draft.questions.length !== draft.targetQuestionCount) {
    throw new Error(`Challenge requires exactly ${draft.targetQuestionCount} questions`);
  }
  const validQuestionCount = await prisma.question.count({
    where: {
      id: { in: draft.questions.map((item) => item.questionId) },
      status: "published",
      knowledgeTags: { some: { syllabusItemId: { in: chapter.syllabusItemIds } } },
      paperQuestions: { some: { paper: { courseId: chapter.courseId, status: "published" } } }
    }
  });
  if (validQuestionCount !== draft.questions.length || chapter.course.status !== "published") {
    throw new Error("Challenge contains unavailable questions or the course is not published");
  }
  const latest = await prisma.chapterChallengeVersion.findFirst({
    where: { chapterId, status: { in: ["draft", "published"] } },
    select: { version: true },
    orderBy: { version: "desc" }
  });
  await prisma.$transaction([
    prisma.chapterChallengeVersion.update({
      where: { id: draft.id },
      data: { status: "published", publishedAt: new Date() }
    }),
    prisma.chapterChallengeVersion.create({
      data: {
        chapterId,
        version: (latest?.version || draft.version) + 1,
        targetQuestionCount: draft.targetQuestionCount
      }
    })
  ]);
  refreshChallengePages(chapterId);
}
