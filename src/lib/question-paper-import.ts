import { Prisma, type LearningCourseType } from "@prisma/client";
import { prisma } from "./prisma";
import type { QuestionBankOwnerType } from "./question-bank-catalog";

import type { QuestionBankEditableQuestionType } from "./question-bank-types";

export type ImportQuestionType = QuestionBankEditableQuestionType;
export type ImportQuestionSourceType = "manual" | "real_exam" | "outline" | "import" | "ai_generated";

export type ImportQuestion = {
  number: number;
  type: ImportQuestionType;
  stem: string;
  options: Array<{ key: string; text: string }>;
  answer: string[];
  analysis: string;
  syllabusItemId?: string;
  syllabusItemIds?: string[];
  source?: string;
  sourceType?: ImportQuestionSourceType;
  sourceYear?: number;
  difficulty?: "easy" | "medium" | "hard";
};

export type ImportQuestionPaperPayload = {
  title: string;
  year: number;
  paperType: "real_exam" | "mock_exam" | "practice_set";
  regionName: string;
  majorName?: string;
  publicSubjectName?: string;
  courseName: string;
  subjectName?: string;
  chapterTitle: string;
  knowledgePointTitle: string;
  questions: ImportQuestion[];
};

export type ImportQuestionPaperTarget = {
  ownerType?: QuestionBankOwnerType;
  ownerId?: string;
  regionId?: string;
};

export type ImportQuestionPaperResult = {
  paperId: string;
  courseId: string;
  importedQuestions: number;
};

export type ImportQuestionPaperOptions = {
  defaultSourceType?: ImportQuestionSourceType;
  defaultKnowledgeTagSource?: "ai" | "manual";
};

type ImportOwner = {
  id: string;
  name: string;
  courseType: LearningCourseType;
};

export function assertImportQuestionPaperPayload(value: unknown): asserts value is ImportQuestionPaperPayload {
  if (!value || typeof value !== "object") {
    throw new Error("导入数据格式不正确。");
  }
  const payload = value as Partial<ImportQuestionPaperPayload>;
  if (!payload.title || !payload.regionName || !payload.courseName || !payload.chapterTitle || !payload.knowledgePointTitle) {
    throw new Error("导入数据缺少题库名称、区域、课程、章节或知识点。");
  }
  if (!Number.isFinite(payload.year)) {
    throw new Error("导入数据缺少年份。");
  }
  if (!Array.isArray(payload.questions) || payload.questions.length === 0) {
    throw new Error("导入数据没有题目。");
  }

  payload.questions.forEach((question, index) => {
    if (!question || typeof question !== "object") {
      throw new Error(`第 ${index + 1} 道题格式不正确。`);
    }
    if (!Number.isFinite(question.number) || !question.type || !question.stem || !Array.isArray(question.answer)) {
      throw new Error(`第 ${index + 1} 道题缺少题号、题型、题干或答案。`);
    }
    if (!Array.isArray(question.options)) {
      throw new Error(`第 ${index + 1} 道题选项格式不正确。`);
    }
    question.options = question.options.map((option, optionIndex) => {
      if (!option || typeof option !== "object") {
        throw new Error(`第 ${index + 1} 道题第 ${optionIndex + 1} 个选项格式不正确。`);
      }
      const source = option as unknown as Record<string, unknown>;
      const key = String(source.key || "").trim().toUpperCase();
      const text = String(source.text || source.content || "").trim();
      if (!key || !text) {
        throw new Error(`第 ${index + 1} 道题第 ${optionIndex + 1} 个选项缺少字母或内容。`);
      }
      return { key, text };
    });
  });
}

export function getQuestionPaperImportStats(payload: ImportQuestionPaperPayload) {
  return payload.questions.reduce<Record<string, number>>((counts, question) => {
    counts[question.type] = (counts[question.type] || 0) + 1;
    return counts;
  }, {});
}

async function nextMajorSortOrder(tx: Prisma.TransactionClient) {
  const latest = await tx.major.findFirst({
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true }
  });
  return (latest?.sortOrder ?? 0) + 1;
}

async function nextPublicSubjectSortOrder(tx: Prisma.TransactionClient) {
  const latest = await tx.publicSubject.findFirst({
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true }
  });
  return (latest?.sortOrder ?? 0) + 1;
}

async function nextCourseSortOrder(tx: Prisma.TransactionClient, courseType: LearningCourseType, regionId: string, ownerId: string) {
  const latest = await tx.learningCourse.findFirst({
    where: courseType === "public_subject" ? { regionId, publicSubjectId: ownerId, courseType } : { regionId, majorId: ownerId, courseType },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true }
  });
  return (latest?.sortOrder ?? 0) + 1;
}

async function nextCourseChapterSortOrder(tx: Prisma.TransactionClient, courseId: string) {
  const latest = await tx.chapter.findFirst({
    where: { courseId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true }
  });
  return (latest?.sortOrder ?? 0) + 1;
}

async function nextKnowledgePointSortOrder(tx: Prisma.TransactionClient, chapterId: string) {
  const latest = await tx.knowledgePoint.findFirst({
    where: { chapterId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true }
  });
  return (latest?.sortOrder ?? 0) + 1;
}

function scoreForQuestion(number: number) {
  return number >= 61 && number <= 70 ? 1 : 2;
}

function ownerNameToSubjectName(ownerName: string) {
  return ownerName.replace(/专业$/, "").replace(/公共课$/, "") || ownerName;
}

function uniqueValues(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

async function ensureRegion(tx: Prisma.TransactionClient, payload: ImportQuestionPaperPayload, target: ImportQuestionPaperTarget) {
  if (target.regionId) {
    return tx.region.findUniqueOrThrow({
      where: { id: target.regionId },
      select: { id: true, name: true }
    });
  }

  return tx.region.upsert({
    where: { name: payload.regionName },
    update: {
      province: "江苏",
      studySystem: payload.regionName.replace("江苏", "") || "三年制",
      status: "active"
    },
    create: {
      name: payload.regionName,
      province: "江苏",
      studySystem: payload.regionName.replace("江苏", "") || "三年制",
      status: "active"
    },
    select: { id: true, name: true }
  });
}

async function ensureImportOwner(tx: Prisma.TransactionClient, payload: ImportQuestionPaperPayload, target: ImportQuestionPaperTarget): Promise<ImportOwner> {
  if (target.ownerType === "public_subject" && target.ownerId) {
    const subject = await tx.publicSubject.findUniqueOrThrow({
      where: { id: target.ownerId },
      select: { id: true, name: true }
    });
    return { id: subject.id, name: subject.name, courseType: "public_subject" };
  }

  if (target.ownerType === "major" && target.ownerId) {
    const major = await tx.major.findUniqueOrThrow({
      where: { id: target.ownerId },
      select: { id: true, name: true }
    });
    return { id: major.id, name: major.name, courseType: "major" };
  }

  if (payload.publicSubjectName) {
    const subject = await tx.publicSubject.upsert({
      where: { name: payload.publicSubjectName },
      update: { status: "published" },
      create: {
        name: payload.publicSubjectName,
        status: "published",
        sortOrder: await nextPublicSubjectSortOrder(tx)
      },
      select: { id: true, name: true }
    });
    return { id: subject.id, name: subject.name, courseType: "public_subject" };
  }

  const majorName = payload.majorName || payload.courseName;
  const major = await tx.major.upsert({
    where: { name: majorName },
    update: { status: "published" },
    create: {
      name: majorName,
      status: "published",
      sortOrder: await nextMajorSortOrder(tx)
    },
    select: { id: true, name: true }
  });
  return { id: major.id, name: major.name, courseType: "major" };
}

async function ensureOwnerRegionLink(tx: Prisma.TransactionClient, regionId: string, owner: ImportOwner) {
  if (owner.courseType === "public_subject") {
    await tx.regionPublicSubject.upsert({
      where: {
        regionId_publicSubjectId: {
          regionId,
          publicSubjectId: owner.id
        }
      },
      update: {},
      create: {
        regionId,
        publicSubjectId: owner.id
      }
    });
    return;
  }

  await tx.regionMajor.upsert({
    where: {
      regionId_majorId: {
        regionId,
        majorId: owner.id
      }
    },
    update: {},
    create: {
      regionId,
      majorId: owner.id
    }
  });
}

async function ensureLearningCourse(tx: Prisma.TransactionClient, regionId: string, owner: ImportOwner, payload: ImportQuestionPaperPayload) {
  const where =
    owner.courseType === "public_subject"
      ? { regionId, publicSubjectId: owner.id, courseType: owner.courseType, name: payload.courseName }
      : { regionId, majorId: owner.id, courseType: owner.courseType, name: payload.courseName };

  const existing = await tx.learningCourse.findFirst({
    where,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true }
  });
  if (existing) {
    return existing;
  }

  return tx.learningCourse.create({
    data: {
      regionId,
      publicSubjectId: owner.courseType === "public_subject" ? owner.id : null,
      majorId: owner.courseType === "major" ? owner.id : null,
      name: payload.courseName || owner.name,
      courseType: owner.courseType,
      status: "published",
      sortOrder: await nextCourseSortOrder(tx, owner.courseType, regionId, owner.id)
    },
    select: { id: true }
  });
}

export async function importQuestionPaperPayload(
  payload: ImportQuestionPaperPayload,
  target: ImportQuestionPaperTarget = {},
  options: ImportQuestionPaperOptions = {}
): Promise<ImportQuestionPaperResult> {
  assertImportQuestionPaperPayload(payload);

  return prisma.$transaction(async (tx) => {
    const region = await ensureRegion(tx, payload, target);
    const owner = await ensureImportOwner(tx, payload, target);
    await ensureOwnerRegionLink(tx, region.id, owner);
    const course = await ensureLearningCourse(tx, region.id, owner, payload);

    const subjectName = payload.subjectName || ownerNameToSubjectName(owner.name);
    const subject = await tx.subject.upsert({
      where: {
        province_examType_name: {
          province: "江苏",
          examType: "专转本",
          name: subjectName
        }
      },
      update: { status: "published" },
      create: {
        province: "江苏",
        examType: "专转本",
        name: subjectName,
        status: "published"
      },
      select: { id: true }
    });

    let chapter = await tx.chapter.findFirst({
      where: { courseId: course.id, title: payload.chapterTitle },
      select: { id: true }
    });
    if (!chapter) {
      chapter = await tx.chapter.create({
        data: {
          subjectId: subject.id,
          courseId: course.id,
          title: payload.chapterTitle,
          sortOrder: await nextCourseChapterSortOrder(tx, course.id),
          status: "published"
        },
        select: { id: true }
      });
    }

    let knowledgePoint = await tx.knowledgePoint.findFirst({
      where: { chapterId: chapter.id, title: payload.knowledgePointTitle },
      select: { id: true, syllabusItemId: true }
    });
    if (!knowledgePoint) {
      knowledgePoint = await tx.knowledgePoint.create({
        data: {
          chapterId: chapter.id,
          title: payload.knowledgePointTitle,
          summary: `${payload.title}导入题目`,
          content: `${payload.title}导入题目`,
          sortOrder: await nextKnowledgePointSortOrder(tx, chapter.id),
          estimatedMinutes: 8,
          status: "published"
        },
        select: { id: true, syllabusItemId: true }
      });
    }

    let paper = await tx.examPaper.findFirst({
      where: {
        regionId: region.id,
        ownerType: owner.courseType,
        publicSubjectId: owner.courseType === "public_subject" ? owner.id : null,
        majorId: owner.courseType === "major" ? owner.id : null,
        title: payload.title,
        year: payload.year
      },
      select: { id: true }
    });
    if (!paper) {
      paper = await tx.examPaper.create({
        data: {
          regionId: region.id,
          ownerType: owner.courseType,
          publicSubjectId: owner.courseType === "public_subject" ? owner.id : null,
          majorId: owner.courseType === "major" ? owner.id : null,
          title: payload.title,
          year: payload.year,
          paperType: payload.paperType,
          status: "archived"
        },
        select: { id: true }
      });
    } else {
      await tx.examPaper.update({
        where: { id: paper.id },
        data: {
          paperType: payload.paperType
        }
      });
    }

    const oldLinks = await tx.examPaperQuestion.findMany({
      where: { paperId: paper.id },
      select: { questionId: true }
    });
    await tx.examPaperQuestion.deleteMany({ where: { paperId: paper.id } });
    for (const link of oldLinks) {
      const [linkCount, oldQuestion] = await Promise.all([
        tx.examPaperQuestion.count({ where: { questionId: link.questionId } }),
        tx.question.findUnique({
          where: { id: link.questionId },
          select: { source: true }
        })
      ]);
      if (linkCount === 0 && oldQuestion?.source === payload.title) {
        await tx.question.delete({ where: { id: link.questionId } });
      }
    }

    for (const question of payload.questions) {
      const tagSyllabusItemIds = uniqueValues([question.syllabusItemId, ...(question.syllabusItemIds || [])]);
      const createdQuestion = await tx.question.create({
        data: {
          knowledgePointId: knowledgePoint.id,
          syllabusItemId: tagSyllabusItemIds[0] || knowledgePoint.syllabusItemId,
          type: question.type,
          stem: question.stem,
          options: question.options,
          answer: question.answer,
          analysis: question.analysis,
          source: question.source || payload.title,
          sourceType: question.sourceType || options.defaultSourceType || "import",
          sourceYear: question.sourceYear || payload.year,
          difficulty: question.difficulty || "medium",
          status: "published"
        },
        select: { id: true }
      });

      if (tagSyllabusItemIds.length > 0) {
        await tx.questionKnowledgeTag.createMany({
          data: tagSyllabusItemIds.map((syllabusItemId) => ({
            questionId: createdQuestion.id,
            syllabusItemId,
            source: options.defaultKnowledgeTagSource || "manual"
          })),
          skipDuplicates: true
        });
      }

      await tx.examPaperQuestion.create({
        data: {
          paperId: paper.id,
          questionId: createdQuestion.id,
          sortOrder: question.number,
          score: scoreForQuestion(question.number)
        }
      });
    }

    await tx.examPaper.update({
      where: { id: paper.id },
      data: { updatedAt: new Date() }
    });

    return {
      paperId: paper.id,
      courseId: course.id,
      importedQuestions: payload.questions.length
    };
  });
}
