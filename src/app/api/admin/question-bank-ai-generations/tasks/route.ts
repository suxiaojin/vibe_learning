import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import type { QuestionBankOwnerType } from "@/lib/question-bank-catalog";
import type { ImportQuestionType } from "@/lib/question-paper-import";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const allowedQuestionTypes: ImportQuestionType[] = ["single_choice", "multiple_choice", "true_false", "fill_blank", "comprehensive"];
const allowedDifficulties = ["easy", "medium", "hard"] as const;

type SyllabusItemRow = {
  id: string;
  parentId: string | null;
  code: string | null;
  title: string;
  sortOrder: number;
};

type CourseRow = {
  id: string;
  name: string;
  sortOrder: number;
  syllabusItems: SyllabusItemRow[];
};

type ReferenceSection = {
  id: string;
  title: string;
  path: string;
  count: number;
  descendantIds: string[];
};

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

function sortSyllabusItems(items: SyllabusItemRow[]) {
  return [...items].sort((left, right) => {
    const codeCompare = (left.code || "").localeCompare(right.code || "", "zh-Hans-CN", { numeric: true });
    return codeCompare || left.sortOrder - right.sortOrder || left.title.localeCompare(right.title, "zh-Hans-CN");
  });
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

function buildReferenceSections(courses: CourseRow[]) {
  const sectionsById = new Map<string, ReferenceSection>();

  courses.forEach((course) => {
    const items = sortSyllabusItems(course.syllabusItems);
    const childrenByParent = new Map<string | null, SyllabusItemRow[]>();

    items.forEach((item) => {
      const children = childrenByParent.get(item.parentId) || [];
      children.push(item);
      childrenByParent.set(item.parentId, children);
    });

    function descendantIdsFor(item: SyllabusItemRow) {
      const ids: string[] = [];
      function collect(current: SyllabusItemRow) {
        ids.push(current.id);
        (childrenByParent.get(current.id) || []).forEach(collect);
      }
      collect(item);
      return ids;
    }

    (childrenByParent.get(null) || []).forEach((chapter) => {
      (childrenByParent.get(chapter.id) || []).forEach((section) => {
        sectionsById.set(section.id, {
          id: section.id,
          title: section.title,
          path: `${course.name} - ${chapter.title} - ${section.title}`,
          count: 0,
          descendantIds: descendantIdsFor(section)
        });
      });
    });
  });

  return sectionsById;
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
    referenceSectionIds?: unknown;
  } | null;

  if (!body || !isOwnerType(body.ownerType) || typeof body.ownerId !== "string" || typeof body.regionId !== "string") {
    return NextResponse.json({ error: "缺少专业、公共课或区域信息。" }, { status: 400 });
  }

  const title = String(body.title || "").trim();
  if (!title) {
    return NextResponse.json({ error: "请填写 AI 题库名称。" }, { status: 400 });
  }

  const count = Math.max(1, Math.min(50, Number(body.count || 10) || 10));
  const year = Math.max(2000, Math.min(2100, Number(body.year || new Date().getFullYear()) || new Date().getFullYear()));
  const requestedQuestionTypes = Array.isArray(body.questionTypes) ? body.questionTypes.filter(isQuestionType) : [];
  const questionTypeCounts = parseQuestionTypeCounts(body.questionTypeCounts);
  const questionTypeCountTotal = Object.values(questionTypeCounts).reduce((total, value) => total + (value || 0), 0);
  if (questionTypeCountTotal > count) {
    return NextResponse.json({ error: "题型数量合计不能超过生成总数。" }, { status: 400 });
  }
  const questionTypes = [...new Set([...requestedQuestionTypes, ...(Object.keys(questionTypeCounts) as ImportQuestionType[])])];
  const referenceSectionIds = Array.isArray(body.referenceSectionIds)
    ? body.referenceSectionIds
        .map((item) => String(item || "").trim())
        .filter((item, index, array) => item && array.indexOf(item) === index)
    : [];
  const difficulty = allowedDifficulties.includes(body.difficulty as (typeof allowedDifficulties)[number])
    ? (body.difficulty as (typeof allowedDifficulties)[number])
    : "medium";

  if (referenceSectionIds.length === 0) {
    return NextResponse.json({ error: "请至少选择一个参考知识点。" }, { status: 400 });
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

  const sectionsById = buildReferenceSections(courses);
  const selectedSections = referenceSectionIds.map((id) => sectionsById.get(id)).filter((section): section is ReferenceSection => Boolean(section));
  if (selectedSections.length !== referenceSectionIds.length) {
    return NextResponse.json({ error: "参考知识点不存在，或不属于当前专业/区域。" }, { status: 400 });
  }

  const countedSections = await Promise.all(
    selectedSections.map(async (section) => ({
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
  const emptySection = countedSections.find((section) => section.count === 0);
  if (emptySection) {
    return NextResponse.json({ error: `该知识点无参考题目：${emptySection.path}` }, { status: 400 });
  }

  const selectedSyllabusItemIds = uniqueValues(countedSections.flatMap((section) => section.descendantIds));
  const samples = await prisma.question.findMany({
    where: {
      ...(questionTypes.length > 0 ? { type: { in: questionTypes } } : {}),
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
    take: 100
  });

  if (samples.length < 3) {
    return NextResponse.json({ error: "当前所选知识点或题型下可参考题目少于 3 道，暂不适合 AI 生题。" }, { status: 400 });
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
      referenceSectionIds,
      referenceSections: countedSections.map(({ descendantIds, ...section }) => section),
      aiApiBaseUrl: process.env.QWEN_API_BASE_URL || "http://10.138.12.88:30001/v1",
      aiApiKey: process.env.QWEN_API_KEY || "",
      aiModel: process.env.QWEN_MODEL || "qwen3.5-35B-A3B",
      samples
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
