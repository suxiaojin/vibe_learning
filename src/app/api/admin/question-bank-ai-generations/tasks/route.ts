import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import type { QuestionBankOwnerType } from "@/lib/question-bank-catalog";
import type { ImportQuestionType } from "@/lib/question-paper-import";
import { buildAiReferenceChapters } from "@/lib/question-bank-ai-reference";
import { questionBankEditableQuestionTypes } from "@/lib/question-bank-types";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const allowedQuestionTypes: readonly ImportQuestionType[] = questionBankEditableQuestionTypes;
const allowedDifficulties = ["easy", "medium", "hard"] as const;

function generatorBaseUrl() {
  return (process.env.QUESTION_AI_GENERATOR_URL || "http://172.18.255.14:8001").replace(/\/+$/, "");
}

function isOwnerType(value: unknown): value is QuestionBankOwnerType {
  return value === "public_subject" || value === "major";
}

function isQuestionType(value: unknown): value is ImportQuestionType {
  return typeof value === "string" && allowedQuestionTypes.includes(value as ImportQuestionType);
}

function ownerCourseWhere(ownerType: QuestionBankOwnerType, ownerId: string, regionId: string) {
  return ownerType === "public_subject"
    ? { courseType: ownerType, publicSubjectId: ownerId, regionId }
    : { courseType: ownerType, majorId: ownerId, regionId };
}

function ownerPaperWhere(ownerType: QuestionBankOwnerType, ownerId: string, regionId: string) {
  return ownerType === "public_subject"
    ? { ownerType, publicSubjectId: ownerId, regionId }
    : { ownerType, majorId: ownerId, regionId };
}

function uniqueValues(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function parseQuestionTypeCounts(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as Partial<Record<ImportQuestionType, number>>;
  }

  return allowedQuestionTypes.reduce<Partial<Record<ImportQuestionType, number>>>((counts, type) => {
    const raw = (value as Record<string, unknown>)[type];
    const parsed = Number(raw);
    if (Number.isInteger(parsed) && parsed > 0) {
      counts[type] = parsed;
    }
    return counts;
  }, {});
}

async function requireAdminJson() {
  const user = await getCurrentAdmin();
  return user?.role === "admin";
}

export async function POST(request: NextRequest) {
  if (!(await requireAdminJson())) {
    return NextResponse.json({ error: "未登录或没有权限。" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    ownerType?: unknown;
    ownerId?: unknown;
    regionId?: unknown;
    title?: unknown;
    year?: unknown;
    count?: unknown;
    questionTypes?: unknown;
    questionTypeCounts?: unknown;
    difficulty?: unknown;
    referenceChapterIds?: unknown;
  } | null;

  if (!body || !isOwnerType(body.ownerType) || typeof body.ownerId !== "string" || typeof body.regionId !== "string") {
    return NextResponse.json({ error: "缺少专业、公共课或区域信息。" }, { status: 400 });
  }

  const title = String(body.title || "").trim();
  if (!title) {
    return NextResponse.json({ error: "请填写 AI 题库名称。" }, { status: 400 });
  }

  const count = Number(body.count ?? 10);
  if (!Number.isInteger(count) || count < 1 || count > 50) {
    return NextResponse.json({ error: "生成数量请填写 1-50 之间的整数。" }, { status: 400 });
  }
  if (Array.isArray(body.questionTypes) && body.questionTypes.some((type) => !isQuestionType(type))) {
    return NextResponse.json({ error: "包含不支持的题型。" }, { status: 400 });
  }
  if (body.questionTypeCounts && typeof body.questionTypeCounts === "object" &&
      Object.keys(body.questionTypeCounts).some((type) => !isQuestionType(type))) {
    return NextResponse.json({ error: "题型数量中包含不支持的题型。" }, { status: 400 });
  }
  const year = Math.max(2000, Math.min(2100, Number(body.year || new Date().getFullYear()) || new Date().getFullYear()));
  const requestedQuestionTypes = Array.isArray(body.questionTypes) ? body.questionTypes.filter(isQuestionType) : [];
  const questionTypeCounts = parseQuestionTypeCounts(body.questionTypeCounts);
  const questionTypeCountTotal = Object.values(questionTypeCounts).reduce((total, value) => total + (value || 0), 0);
  if (questionTypeCountTotal > count) {
    return NextResponse.json({ error: "题型数量合计不能超过生成总数。" }, { status: 400 });
  }
  let questionTypes = [...new Set([...requestedQuestionTypes, ...(Object.keys(questionTypeCounts) as ImportQuestionType[])])];
  const referenceChapterIds = Array.isArray(body.referenceChapterIds)
    ? body.referenceChapterIds
        .map((item) => String(item || "").trim())
        .filter((item, index, array) => item && array.indexOf(item) === index)
    : [];
  const difficulty = allowedDifficulties.includes(body.difficulty as (typeof allowedDifficulties)[number])
    ? (body.difficulty as (typeof allowedDifficulties)[number])
    : "medium";

  if (referenceChapterIds.length === 0) {
    return NextResponse.json({ error: "请至少选择一个参考章节。" }, { status: 400 });
  }

  const courseWhere = ownerCourseWhere(body.ownerType, body.ownerId, body.regionId);
  const paperWhere = ownerPaperWhere(body.ownerType, body.ownerId, body.regionId);
  const [region, owner, courses] = await Promise.all([
    prisma.region.findUnique({
      where: { id: body.regionId },
      select: { id: true, name: true }
    }),
    body.ownerType === "public_subject"
      ? prisma.publicSubject.findUnique({ where: { id: body.ownerId }, select: { id: true, name: true } })
      : prisma.major.findUnique({ where: { id: body.ownerId }, select: { id: true, name: true } }),
    prisma.learningCourse.findMany({
      where: courseWhere,
      select: {
        id: true,
        name: true,
        sortOrder: true,
        syllabusItems: {
          where: { checkpointScope: null },
          select: {
            id: true,
            parentId: true,
            code: true,
            title: true,
            sortOrder: true
          },
          orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }, { code: "asc" }]
        }
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
    })
  ]);

  if (!region || !owner || courses.length === 0) {
    return NextResponse.json({ error: "当前专业或区域下还没有可用于 AI 生题的课程数据。" }, { status: 400 });
  }

  const chaptersById = new Map(buildAiReferenceChapters(courses).map((chapter) => [chapter.id, chapter]));
  const selectedChapters = referenceChapterIds.flatMap((id) => {
    const chapter = chaptersById.get(id);
    return chapter ? [chapter] : [];
  });
  if (selectedChapters.length !== referenceChapterIds.length) {
    return NextResponse.json({ error: "参考章节不存在，或不属于当前专业/区域。" }, { status: 400 });
  }

  const countedChapters = await Promise.all(
    selectedChapters.map(async (section) => ({
      ...section,
      count: await prisma.examPaperQuestion.count({
        where: {
          paper: {
            ...paperWhere
          },
          question: {
            knowledgeTags: {
              some: {
                syllabusItemId: { in: section.descendantIds }
              }
            }
          }
        }
      })
    }))
  );
  const emptyChapter = countedChapters.find((section) => section.count === 0);
  if (emptyChapter) {
    return NextResponse.json({ error: `该章节无参考题目：${emptyChapter.path}` }, { status: 400 });
  }

  const selectedSyllabusItemIds = uniqueValues(countedChapters.flatMap((section) => section.descendantIds));
  const chapterTypes = await Promise.all(countedChapters.map(async (chapter) => {
    const rows = await prisma.question.findMany({
      where: {
        paperQuestions: { some: { paper: paperWhere } },
        knowledgeTags: { some: { syllabusItemId: { in: chapter.descendantIds } } }
      },
      select: { type: true },
      distinct: ["type"]
    });
    return { ...chapter, questionTypes: rows.map((row) => row.type).filter(isQuestionType) };
  }));
  const availableTypes = new Set(chapterTypes.flatMap((chapter) => chapter.questionTypes));
  if (questionTypes.some((type) => !availableTypes.has(type))) {
    return NextResponse.json({ error: "所选题型不在参考章节已有题型中，请重新选择。" }, { status: 400 });
  }
  if (questionTypes.length === 0) questionTypes = allowedQuestionTypes.filter((type) => availableTypes.has(type));
  if (questionTypes.length === 0) {
    return NextResponse.json({ error: "所选章节没有支持生成的题型。" }, { status: 400 });
  }

  const sampleGroups = await Promise.all(questionTypes.map((type) => prisma.question.findMany({
    where: {
      type,
      paperQuestions: {
        some: {
          paper: {
            ...paperWhere
          }
        }
      },
      knowledgeTags: {
        some: {
          syllabusItemId: { in: selectedSyllabusItemIds }
        }
      }
    },
    select: {
      id: true,
      type: true,
      stem: true,
      options: true,
      answer: true,
      analysis: true,
      source: true,
      sourceType: true,
      sourceYear: true,
      difficulty: true,
      knowledgeTags: {
        where: {
          syllabusItemId: { in: selectedSyllabusItemIds }
        },
        select: {
          syllabusItemId: true,
          source: true
        }
      }
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: Math.ceil(100 / questionTypes.length)
  })));
  // Interleave types before the generator's sample limit so rare types keep examples.
  const samples = Array.from({ length: Math.max(...sampleGroups.map((group) => group.length)) }, (_, index) =>
    sampleGroups.flatMap((group) => group[index] ? [group[index]] : [])
  ).flat().slice(0, 100);

  if (samples.length < 3) {
    return NextResponse.json({ error: "当前所选章节或题型下可参考题目少于 3 道，暂不适合 AI 生题。" }, { status: 400 });
  }

  const response = await fetch(`${generatorBaseUrl()}/generate-question-bank-tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ownerType: body.ownerType,
      ownerId: body.ownerId,
      ownerName: owner.name,
      regionId: body.regionId,
      regionName: region.name,
      courseName: courses[0]?.name || owner.name,
      title,
      year,
      count,
      questionTypes,
      questionTypeCounts,
      difficulty,
      sourceLabel: "AI模拟真题",
      referenceChapterIds,
      referenceChapters: chapterTypes.map(({ descendantIds, ...chapter }) => chapter),
      aiApiBaseUrl: process.env.QWEN_API_BASE_URL || "http://10.138.12.88:30001/v1",
      aiApiKey: process.env.QWEN_API_KEY || "",
      aiModel: process.env.QWEN_MODEL || "qwen3.5-35B-A3B",
      samples: samples.map((sample) => ({
        ...sample,
        referenceChapterIds: chapterTypes
          .filter((chapter) => sample.knowledgeTags.some((tag) => chapter.descendantIds.includes(tag.syllabusItemId)))
          .map((chapter) => chapter.id)
      }))
    })
  });

  if (!response.ok) {
    const message = await response.text();
    return NextResponse.json(
      {
        error: `AI 生题服务创建任务失败：${response.status}`,
        detail: message.slice(0, 1200)
      },
      { status: 502 }
    );
  }

  return NextResponse.json(await response.json());
}
