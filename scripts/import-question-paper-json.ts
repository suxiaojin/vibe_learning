import { Prisma, PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";

const prisma = new PrismaClient();

type ImportQuestion = {
  number: number;
  type: "single_choice" | "multiple_choice" | "true_false" | "fill_blank" | "comprehensive";
  stem: string;
  options: Array<{ key: string; text: string }>;
  answer: string[];
  analysis: string;
  source?: string;
  sourceYear?: number;
  difficulty?: "easy" | "medium" | "hard";
};

type ImportPayload = {
  title: string;
  year: number;
  paperType: "real_exam" | "mock_exam" | "practice_set";
  regionName: string;
  majorName: string;
  courseName: string;
  chapterTitle: string;
  knowledgePointTitle: string;
  questions: ImportQuestion[];
};

function assertPayload(value: unknown): asserts value is ImportPayload {
  if (!value || typeof value !== "object") {
    throw new Error("Import payload must be an object");
  }
  const payload = value as Partial<ImportPayload>;
  if (!payload.title || !payload.regionName || !payload.majorName || !payload.courseName) {
    throw new Error("Import payload is missing title, regionName, majorName, or courseName");
  }
  if (!Array.isArray(payload.questions) || payload.questions.length === 0) {
    throw new Error("Import payload has no questions");
  }
}

async function nextMajorSortOrder(tx: Prisma.TransactionClient) {
  const latest = await tx.major.findFirst({
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true }
  });
  return (latest?.sortOrder ?? 0) + 1;
}

async function nextMajorCourseSortOrder(tx: Prisma.TransactionClient, regionId: string, majorId: string) {
  const latest = await tx.learningCourse.findFirst({
    where: { regionId, majorId, courseType: "major" },
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

async function main() {
  const jsonPath = process.argv[2];
  if (!jsonPath) {
    throw new Error("Usage: npx tsx scripts/import-question-paper-json.ts <payload.json>");
  }

  const payload = JSON.parse(await readFile(jsonPath, "utf-8")) as unknown;
  assertPayload(payload);

  const result = await prisma.$transaction(async (tx) => {
    const region = await tx.region.upsert({
      where: { name: payload.regionName },
      update: { province: "江苏", studySystem: payload.regionName.replace("江苏", "") || "三年制", status: "active" },
      create: {
        name: payload.regionName,
        province: "江苏",
        studySystem: payload.regionName.replace("江苏", "") || "三年制",
        status: "active"
      },
      select: { id: true }
    });

    let major = await tx.major.findUnique({
      where: { name: payload.majorName },
      select: { id: true }
    });
    if (!major) {
      major = await tx.major.create({
        data: {
          name: payload.majorName,
          status: "published",
          sortOrder: await nextMajorSortOrder(tx)
        },
        select: { id: true }
      });
    }

    await tx.regionMajor.upsert({
      where: {
        regionId_majorId: {
          regionId: region.id,
          majorId: major.id
        }
      },
      update: {},
      create: {
        regionId: region.id,
        majorId: major.id
      }
    });

    let course = await tx.learningCourse.findFirst({
      where: {
        regionId: region.id,
        majorId: major.id,
        courseType: "major"
      },
      select: { id: true }
    });
    if (!course) {
      course = await tx.learningCourse.create({
        data: {
          regionId: region.id,
          majorId: major.id,
          name: payload.courseName,
          courseType: "major",
          status: "published",
          sortOrder: await nextMajorCourseSortOrder(tx, region.id, major.id)
        },
        select: { id: true }
      });
    }

    const subject = await tx.subject.upsert({
      where: {
        province_examType_name: {
          province: "江苏",
          examType: "专转本",
          name: "计算机"
        }
      },
      update: { status: "published" },
      create: {
        province: "江苏",
        examType: "专转本",
        name: "计算机",
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
        courseId: course.id,
        title: payload.title,
        year: payload.year
      },
      select: { id: true }
    });
    if (!paper) {
      paper = await tx.examPaper.create({
        data: {
          courseId: course.id,
          title: payload.title,
          year: payload.year,
          paperType: payload.paperType,
          status: "published"
        },
        select: { id: true }
      });
    } else {
      await tx.examPaper.update({
        where: { id: paper.id },
        data: {
          paperType: payload.paperType,
          status: "published"
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
      const createdQuestion = await tx.question.create({
        data: {
          knowledgePointId: knowledgePoint.id,
          syllabusItemId: knowledgePoint.syllabusItemId,
          type: question.type,
          stem: question.stem,
          options: question.options,
          answer: question.answer,
          analysis: question.analysis,
          source: question.source || payload.title,
          sourceType: "import",
          sourceYear: question.sourceYear || payload.year,
          difficulty: question.difficulty || "medium",
          status: "published"
        },
        select: { id: true }
      });

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

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
