import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import type { QuestionBankOwnerType } from "@/lib/question-bank-catalog";
import type { ImportQuestionType } from "@/lib/question-paper-import";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const allowedQuestionTypes: ImportQuestionType[] = ["single_choice", "multiple_choice", "true_false", "fill_blank", "comprehensive"];
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

async function requireAdminJson() {
  const user = await getCurrentUser();
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
    difficulty?: unknown;
    referencePaperIds?: unknown;
  } | null;

  if (!body || !isOwnerType(body.ownerType) || typeof body.ownerId !== "string" || typeof body.regionId !== "string") {
    return NextResponse.json({ error: "缺少专业、公共课或区域信息。" }, { status: 400 });
  }

  const title = String(body.title || "").trim();
  if (!title) {
    return NextResponse.json({ error: "请填写 AI 题库名称。" }, { status: 400 });
  }

  const count = Math.max(1, Math.min(20, Number(body.count || 10) || 10));
  const year = Math.max(2000, Math.min(2100, Number(body.year || new Date().getFullYear()) || new Date().getFullYear()));
  const questionTypes = Array.isArray(body.questionTypes) ? body.questionTypes.filter(isQuestionType) : [];
  const referencePaperIds = Array.isArray(body.referencePaperIds)
    ? body.referencePaperIds
        .map((item) => String(item || "").trim())
        .filter((item, index, array) => item && array.indexOf(item) === index)
    : [];
  const difficulty = allowedDifficulties.includes(body.difficulty as (typeof allowedDifficulties)[number])
    ? (body.difficulty as (typeof allowedDifficulties)[number])
    : "medium";

  if (referencePaperIds.length === 0) {
    return NextResponse.json({ error: "请至少选择一个参考题库。" }, { status: 400 });
  }

  const [region, owner, course, referencePapers] = await Promise.all([
    prisma.region.findUnique({
      where: { id: body.regionId },
      select: { id: true, name: true }
    }),
    body.ownerType === "public_subject"
      ? prisma.publicSubject.findUnique({ where: { id: body.ownerId }, select: { id: true, name: true } })
      : prisma.major.findUnique({ where: { id: body.ownerId }, select: { id: true, name: true } }),
    prisma.learningCourse.findFirst({
      where: ownerCourseWhere(body.ownerType, body.ownerId, body.regionId),
      select: { id: true, name: true }
    }),
    prisma.examPaper.findMany({
      where: {
        id: { in: referencePaperIds },
        course: ownerCourseWhere(body.ownerType, body.ownerId, body.regionId)
      },
      select: {
        id: true,
        title: true
      }
    })
  ]);

  if (!region || !owner || !course) {
    return NextResponse.json({ error: "当前专业或区域下还没有可用于 AI 生题的课程数据。" }, { status: 400 });
  }
  if (referencePapers.length !== referencePaperIds.length) {
    return NextResponse.json({ error: "参考题库不存在，或不属于当前专业/区域。" }, { status: 400 });
  }

  const samples = await prisma.question.findMany({
    where: {
      status: "published",
      ...(questionTypes.length > 0 ? { type: { in: questionTypes } } : {}),
      paperQuestions: {
        some: {
          paperId: { in: referencePaperIds },
          paper: {
            course: ownerCourseWhere(body.ownerType, body.ownerId, body.regionId)
          }
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
      difficulty: true
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: 80
  });

  if (samples.length < 3) {
    return NextResponse.json({ error: "当前专业或题型下可参考题目少于 3 道，暂不适合 AI 生题。" }, { status: 400 });
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
      courseName: course.name || owner.name,
      title,
      year,
      count,
      questionTypes,
      difficulty,
      sourceLabel: "AI模拟真题",
      referencePapers,
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
