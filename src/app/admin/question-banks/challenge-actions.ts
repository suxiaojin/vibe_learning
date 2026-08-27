"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isQuestionBankAutoGradedQuestionType } from "@/lib/question-bank-types";

const statisticsPath = "/admin/question-banks/statistics";
type ChallengeScopeType = "chapter" | "course";

function getChallengeScopeInput(formData: FormData) {
  const scopeType = String(formData.get("scopeType") || "chapter") as ChallengeScopeType;
  const scopeId = String(formData.get("scopeId") || formData.get("chapterId") || "");
  if ((scopeType !== "chapter" && scopeType !== "course") || !scopeId) {
    throw new Error("Invalid challenge scope");
  }
  return { scopeType, scopeId };
}

async function ensureCourseCheckpoint(courseId: string) {
  const existing = await prisma.syllabusItem.findFirst({
    where: { courseId, checkpointScope: "course" },
    select: { id: true }
  });
  if (existing) {
    return existing;
  }

  const latest = await prisma.syllabusItem.findFirst({
    where: { courseId, checkpointScope: null },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true }
  });
  return prisma.syllabusItem.create({
    data: {
      courseId,
      parentId: null,
      checkpointScope: "course",
      title: "综合闯关",
      description: "整门课程合并为一个关卡",
      sortOrder: (latest?.sortOrder || 0) + 1,
      status: "published"
    },
    select: { id: true }
  });
}

async function getChallengeScope(scopeType: ChallengeScopeType, scopeId: string, createCheckpoint = false) {
  if (scopeType === "course") {
    const course = await prisma.learningCourse.findUniqueOrThrow({
      where: { id: scopeId },
      select: { id: true, status: true }
    });
    const checkpoint = createCheckpoint
      ? await ensureCourseCheckpoint(course.id)
      : await prisma.syllabusItem.findFirstOrThrow({
          where: { courseId: course.id, checkpointScope: "course" },
          select: { id: true }
        });
    const syllabusItems = await prisma.syllabusItem.findMany({
      where: { courseId: course.id, checkpointScope: null },
      select: { id: true }
    });
    return {
      type: scopeType,
      id: course.id,
      checkpointId: checkpoint.id,
      courseId: course.id,
      courseStatus: course.status,
      syllabusItemIds: syllabusItems.map((item) => item.id)
    };
  }

  const chapter = await prisma.syllabusItem.findFirstOrThrow({
    where: { id: scopeId, parentId: null, checkpointScope: null },
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
  return {
    type: scopeType,
    id: chapter.id,
    checkpointId: chapter.id,
    courseId: chapter.courseId,
    courseStatus: chapter.course.status,
    syllabusItemIds
  };
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

async function assertQuestionCanEnterChallenge(scopeType: ChallengeScopeType, scopeId: string, questionId: string) {
  const scope = await getChallengeScope(scopeType, scopeId, scopeType === "course");
  await prisma.question.findFirstOrThrow({
    where: {
      id: questionId,
      status: "published",
      knowledgeTags: { some: { syllabusItemId: { in: scope.syllabusItemIds } } },
      paperQuestions: {
        some: {
          paper: {
            status: "published"
          }
        }
      }
    },
    select: { id: true }
  });
  return scope;
}

async function assertQuestionIsUnusedByOtherChallenge(checkpointId: string, challengeVersionId: string, questionId: string) {
  const existing = await prisma.chapterChallengeQuestion.findFirst({
    where: {
      questionId,
      challengeVersionId: { not: challengeVersionId },
      challengeVersion: { chapterId: checkpointId, status: { in: ["draft", "published"] } }
    },
    select: { challengeVersion: { select: { version: true } } }
  });
  if (existing) {
    throw new Error(`Question is already used by challenge ${existing.challengeVersion.version}`);
  }
}

function refreshChallengePages(checkpointId: string) {
  revalidatePath(statisticsPath);
  revalidatePath("/learn");
  revalidatePath("/course-center");
  revalidatePath(`/learn/${checkpointId}`);
}

export async function addQuestionToChapterChallenge(formData: FormData) {
  await requireAdmin();
  const { scopeType, scopeId } = getChallengeScopeInput(formData);
  const challengeVersionId = String(formData.get("challengeVersionId") || "");
  const questionId = String(formData.get("questionId") || "");
  const scope = await assertQuestionCanEnterChallenge(scopeType, scopeId, questionId);
  const challenge = await getActiveChallenge(scope.checkpointId, challengeVersionId);
  if (challenge.questions.some((item) => item.questionId === questionId)) {
    refreshChallengePages(scope.checkpointId);
    return;
  }
  if (challenge.questions.length >= challenge.targetQuestionCount) {
    throw new Error("Challenge already has the configured number of questions");
  }
  await assertQuestionIsUnusedByOtherChallenge(scope.checkpointId, challenge.id, questionId);
  await prisma.chapterChallengeQuestion.create({
    data: {
      challengeVersionId: challenge.id,
      questionId,
      sortOrder: challenge.questions.length + 1
    }
  });
  refreshChallengePages(scope.checkpointId);
}

export async function removeQuestionFromChapterChallenge(formData: FormData) {
  await requireAdmin();
  const { scopeType, scopeId } = getChallengeScopeInput(formData);
  const challengeVersionId = String(formData.get("challengeVersionId") || "");
  const questionId = String(formData.get("questionId") || "");
  const scope = await getChallengeScope(scopeType, scopeId, scopeType === "course");
  const draft = await getExistingChallenge(scope.checkpointId, challengeVersionId);
  if (scopeType === "course" && draft.status === "published") {
    const remainingQuestions = await prisma.question.findMany({
      where: {
        id: {
          in: draft.questions
            .filter((item) => item.questionId !== questionId)
            .map((item) => item.questionId)
        }
      },
      select: { type: true }
    });
    if (!remainingQuestions.some((question) => isQuestionBankAutoGradedQuestionType(question.type))) {
      throw new Error("Published course challenge requires at least one auto-graded question");
    }
  }
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
  refreshChallengePages(scope.checkpointId);
}

export async function moveChapterChallengeQuestion(formData: FormData) {
  await requireAdmin();
  const { scopeType, scopeId } = getChallengeScopeInput(formData);
  const challengeVersionId = String(formData.get("challengeVersionId") || "");
  const questionId = String(formData.get("questionId") || "");
  const direction = String(formData.get("direction") || "");
  const scope = await getChallengeScope(scopeType, scopeId, scopeType === "course");
  const draft = await getExistingChallenge(scope.checkpointId, challengeVersionId);
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
  refreshChallengePages(scope.checkpointId);
}

export async function updateChapterChallengeTarget(formData: FormData) {
  await requireAdmin();
  const { scopeType, scopeId } = getChallengeScopeInput(formData);
  const challengeVersionId = String(formData.get("challengeVersionId") || "");
  const targetQuestionCount = Number(formData.get("targetQuestionCount") || 10);
  if (!Number.isInteger(targetQuestionCount) || targetQuestionCount < 1 || targetQuestionCount > 100) {
    throw new Error("Challenge question count must be between 1 and 100");
  }
  const scope = await getChallengeScope(scopeType, scopeId, scopeType === "course");
  const challenge = await getActiveChallenge(scope.checkpointId, challengeVersionId);
  await prisma.chapterChallengeVersion.update({
    where: { id: challenge.id },
    data: { targetQuestionCount }
  });
  refreshChallengePages(scope.checkpointId);
}

export async function deleteChapterChallenge(formData: FormData) {
  await requireAdmin();
  const { scopeType, scopeId } = getChallengeScopeInput(formData);
  const challengeVersionId = String(formData.get("challengeVersionId") || "");
  const scope = await getChallengeScope(scopeType, scopeId, scopeType === "course");
  const checkpointId = scope.checkpointId;

  await prisma.$transaction(async (transaction) => {
    const challenge = await transaction.chapterChallengeVersion.findFirstOrThrow({
      where: {
        id: challengeVersionId,
        chapterId: checkpointId,
        status: { in: ["draft", "published"] }
      },
      select: { id: true, status: true }
    });
    const versions = await transaction.chapterChallengeVersion.findMany({
      where: { chapterId: checkpointId },
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
      where: { chapterId: checkpointId, status: "archived" },
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
      where: { chapterId: checkpointId, status: { in: ["draft", "published"] } },
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

  await ensureDraft(checkpointId);
  refreshChallengePages(checkpointId);
}

export async function saveChapterChallenge(formData: FormData) {
  await requireAdmin();
  const { scopeType, scopeId } = getChallengeScopeInput(formData);
  const challengeVersionId = String(formData.get("challengeVersionId") || "");
  const scope = await getChallengeScope(scopeType, scopeId, scopeType === "course");
  const draft = await getEditableDraft(scope.checkpointId, challengeVersionId);
  if (draft.questions.length !== draft.targetQuestionCount) {
    throw new Error(`Challenge requires exactly ${draft.targetQuestionCount} questions`);
  }
  const validQuestions = await prisma.question.findMany({
    where: {
      id: { in: draft.questions.map((item) => item.questionId) },
      status: "published",
      knowledgeTags: { some: { syllabusItemId: { in: scope.syllabusItemIds } } },
      paperQuestions: { some: { paper: { status: "published" } } }
    },
    select: { type: true }
  });
  if (validQuestions.length !== draft.questions.length || scope.courseStatus !== "published") {
    throw new Error("Challenge contains unavailable questions or the course is not published");
  }
  if (scopeType === "course" && !validQuestions.some((question) => isQuestionBankAutoGradedQuestionType(question.type))) {
    throw new Error("Course challenge requires at least one auto-graded question");
  }
  const latest = await prisma.chapterChallengeVersion.findFirst({
    where: { chapterId: scope.checkpointId, status: { in: ["draft", "published"] } },
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
        chapterId: scope.checkpointId,
        version: (latest?.version || draft.version) + 1,
        targetQuestionCount: draft.targetQuestionCount
      }
    })
  ]);
  refreshChallengePages(scope.checkpointId);
}

export async function updateCourseChallengeMode(formData: FormData) {
  await requireAdmin();
  const courseId = String(formData.get("courseId") || "");
  const challengeMode = String(formData.get("challengeMode") || "");
  if (!courseId || (challengeMode !== "chapter" && challengeMode !== "course")) {
    throw new Error("Invalid course challenge mode");
  }

  const checkpoint = challengeMode === "course" ? await ensureCourseCheckpoint(courseId) : null;
  if (checkpoint) {
    const chapterRoots = await prisma.syllabusItem.findMany({
      where: { courseId, parentId: null, checkpointScope: null },
      select: { id: true }
    });
    const activeChallenges = await prisma.chapterChallengeVersion.findMany({
      where: {
        chapterId: { in: chapterRoots.map((chapter) => chapter.id) },
        status: "published",
        version: 1,
        questions: { some: {} }
      },
      select: { chapterId: true }
    });
    const activeChapterIds = [...new Set(activeChallenges.map((challenge) => challenge.chapterId))];
    if (activeChapterIds.length > 0) {
      const passedProgress = await prisma.userSyllabusProgress.findMany({
        where: { syllabusItemId: { in: activeChapterIds }, status: "passed" },
        select: { userId: true, syllabusItemId: true, bestScore: true, passedAt: true }
      });
      const progressByUser = new Map<
        string,
        Map<string, { bestScore: number; passedAt: Date | null }>
      >();
      for (const progress of passedProgress) {
        const userProgress = progressByUser.get(progress.userId) || new Map();
        userProgress.set(progress.syllabusItemId, {
          bestScore: progress.bestScore,
          passedAt: progress.passedAt
        });
        progressByUser.set(progress.userId, userProgress);
      }
      const completedUsers = [...progressByUser.entries()].filter(([, progress]) =>
        activeChapterIds.every((chapterId) => progress.has(chapterId))
      );
      const existingCourseProgress = completedUsers.length > 0
        ? await prisma.userSyllabusProgress.findMany({
            where: {
              userId: { in: completedUsers.map(([userId]) => userId) },
              syllabusItemId: checkpoint.id
            },
            select: { userId: true, bestScore: true, passedAt: true }
          })
        : [];
      const existingCourseProgressByUser = new Map(
        existingCourseProgress.map((progress) => [progress.userId, progress])
      );
      await prisma.$transaction(
        completedUsers.map(([userId, progress]) => {
          const records = activeChapterIds.map((chapterId) => progress.get(chapterId)!);
          const bestScore = Math.min(...records.map((record) => record.bestScore));
          const passedAt = records.reduce<Date | null>((latest, record) => {
            if (!record.passedAt) {
              return latest;
            }
            return !latest || record.passedAt > latest ? record.passedAt : latest;
          }, null);
          const existing = existingCourseProgressByUser.get(userId);
          return prisma.userSyllabusProgress.upsert({
            where: {
              userId_syllabusItemId: { userId, syllabusItemId: checkpoint.id }
            },
            create: {
              userId,
              syllabusItemId: checkpoint.id,
              status: "passed",
              bestScore,
              passedAt: passedAt || new Date()
            },
            update: {
              status: "passed",
              bestScore: Math.max(existing?.bestScore || 0, bestScore),
              passedAt: existing?.passedAt || passedAt || new Date()
            }
          });
        })
      );
    }
  }

  await prisma.learningCourse.update({
    where: { id: courseId },
    data: { challengeMode }
  });
  revalidatePath(statisticsPath);
  revalidatePath("/learn");
  revalidatePath("/course-center");
  if (checkpoint) {
    revalidatePath(`/learn/${checkpoint.id}`);
  }
}
