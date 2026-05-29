import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getQuestionBankAiTaggingPrompt } from "@/lib/question-bank-ai-tagging-prompt";
import { prisma } from "@/lib/prisma";
import { askQwen } from "@/lib/qwen";

export const runtime = "nodejs";
export const maxDuration = 300;

type Candidate = {
  id: string;
  path: string;
  title: string;
  description: string | null;
};

type Selection = {
  id: string;
  confidence: number | null;
  reason: string | null;
};

type OwnerCourse = {
  id: string;
  name: string;
  syllabusItems: SyllabusItemRow[];
};

type SyllabusItemRow = {
  id: string;
  parentId: string | null;
  code: string | null;
  title: string;
  description: string | null;
};

type PaperCourse = {
  courseType: "public_subject" | "major";
  publicSubjectId: string | null;
  majorId: string | null;
};

async function requireAdminJson() {
  const user = await getCurrentUser();
  return user?.role === "admin";
}

function ownerCourseWhere(course: PaperCourse) {
  return course.courseType === "public_subject"
    ? { courseType: "public_subject" as const, publicSubjectId: course.publicSubjectId }
    : { courseType: "major" as const, majorId: course.majorId };
}

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeJsonText(value: string) {
  return value.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function parseJsonPayload(value: string) {
  const normalized = normalizeJsonText(value);
  const fenced = normalized.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = (fenced?.[1] || normalized).trim();

  try {
    return JSON.parse(source) as unknown;
  } catch {
    const objectStart = source.indexOf("{");
    const objectEnd = source.lastIndexOf("}");
    if (objectStart >= 0 && objectEnd > objectStart) {
      try {
        return JSON.parse(source.slice(objectStart, objectEnd + 1)) as unknown;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeConfidence(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.min(1, Math.max(0, parsed));
}

function normalizeReason(value: unknown) {
  const reason = String(value || "").trim();
  return reason ? reason.slice(0, 240) : null;
}

function findSelectedCandidate(content: string, candidates: Candidate[]) {
  const payload = parseJsonPayload(content);
  const row = Array.isArray(payload) ? payload[0] : payload;
  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const candidateByPath = new Map(candidates.map((candidate) => [candidate.path, candidate]));

  if (isRecord(row)) {
    const selectedId = String(row.syllabusItemId || row.knowledgePointId || row.id || "").trim();
    const selectedPath = String(row.path || row.knowledgePointPath || row.knowledgePoint || "").trim();
    const candidate = candidateById.get(selectedId) || candidateByPath.get(selectedPath);

    if (candidate) {
      return {
        id: candidate.id,
        confidence: normalizeConfidence(row.confidence),
        reason: normalizeReason(row.reason)
      };
    }
  }

  const normalized = normalizeJsonText(content);
  const embeddedCandidate = candidates.find((candidate) => normalized.includes(candidate.id));
  return embeddedCandidate ? { id: embeddedCandidate.id, confidence: null, reason: "AI 返回格式不完整，已按返回 ID 兜底匹配。" } : null;
}

function itemDisplayTitle(item: SyllabusItemRow) {
  return item.title.trim();
}

function buildCandidates(courses: OwnerCourse[]) {
  const candidates: Candidate[] = [];

  courses.forEach((course) => {
    const itemById = new Map(course.syllabusItems.map((item) => [item.id, item]));

    function ancestorsFor(item: SyllabusItemRow) {
      const ancestors = [item];
      let parentId = item.parentId;

      while (parentId) {
        const parent = itemById.get(parentId);
        if (!parent) {
          break;
        }
        ancestors.unshift(parent);
        parentId = parent.parentId;
      }

      return ancestors;
    }

    const secondLevelItems = course.syllabusItems.filter((item) => ancestorsFor(item).length === 2);
    const targetItems = secondLevelItems.length > 0 ? secondLevelItems : course.syllabusItems.filter((item) => !item.parentId);

    targetItems.forEach((item) => {
      const ancestors = ancestorsFor(item);
      const displayItems = ancestors.slice(0, 2);

      candidates.push({
        id: item.id,
        path: [course.name, ...displayItems.map(itemDisplayTitle)].filter(Boolean).join(" - "),
        title: item.title,
        description: item.description
      });
    });
  });

  return candidates;
}

function questionContext(question: {
  type: string;
  stem: string;
  options: unknown;
  answer: unknown;
  analysis: string;
}) {
  return {
    type: question.type,
    stem: stripHtml(question.stem),
    options: question.options,
    answer: question.answer,
    analysis: stripHtml(question.analysis)
  };
}

async function classifyQuestion({
  paperTitle,
  question,
  candidates
}: {
  paperTitle: string;
  question: {
    id: string;
    type: string;
    stem: string;
    options: unknown;
    answer: unknown;
    analysis: string;
  };
  candidates: Candidate[];
}) {
  const system = await getQuestionBankAiTaggingPrompt();
  const prompt = [
    `题库：${paperTitle}`,
    "候选知识点 JSON：",
    JSON.stringify(candidates, null, 2),
    "待归属题目 JSON：",
    JSON.stringify(questionContext(question), null, 2),
    "返回格式：",
    JSON.stringify({
      syllabusItemId: "候选知识点 id",
      confidence: 0.86,
      reason: "20字以内说明"
    })
  ].join("\n\n");

  const answer = await askQwen(
    [
      { role: "system", content: system },
      { role: "user", content: prompt }
    ],
    { temperature: 0.1, timeoutMs: 45_000 }
  );

  return findSelectedCandidate(answer, candidates);
}

async function saveAiTag({
  questionId,
  syllabusItemId,
  confidence,
  reason
}: {
  questionId: string;
  syllabusItemId: string;
  confidence: number | null;
  reason: string | null;
}) {
  await prisma.$transaction(async (tx) => {
    await tx.questionKnowledgeTag.deleteMany({
      where: {
        questionId,
        source: "ai"
      }
    });

    const existingTag = await tx.questionKnowledgeTag.findUnique({
      where: {
        questionId_syllabusItemId: {
          questionId,
          syllabusItemId
        }
      },
      select: { id: true, source: true }
    });

    if (existingTag?.source === "ai") {
      await tx.questionKnowledgeTag.update({
        where: { id: existingTag.id },
        data: {
          confidence,
          reason
        }
      });
    } else if (!existingTag) {
      await tx.questionKnowledgeTag.create({
        data: {
          questionId,
          syllabusItemId,
          source: "ai",
          confidence,
          reason
        }
      });
    }

    const linkedKnowledgePoint = await tx.knowledgePoint.findFirst({
      where: { syllabusItemId },
      select: { id: true }
    });

    await tx.question.update({
      where: { id: questionId },
      data: {
        syllabusItemId,
        ...(linkedKnowledgePoint ? { knowledgePointId: linkedKnowledgePoint.id } : {})
      }
    });
  });
}

export async function POST(_request: NextRequest, context: { params: Promise<{ paperId: string }> }) {
  if (!(await requireAdminJson())) {
    return NextResponse.json({ error: "未登录或没有权限。" }, { status: 401 });
  }

  const { paperId } = await context.params;
  const paper = await prisma.examPaper.findUnique({
    where: { id: paperId },
    select: {
      id: true,
      title: true,
      course: {
        select: {
          courseType: true,
          publicSubjectId: true,
          majorId: true
        }
      },
      questions: {
        select: {
          id: true,
          question: {
            select: {
              id: true,
              type: true,
              stem: true,
              options: true,
              answer: true,
              analysis: true
            }
          }
        },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
      }
    }
  });

  if (!paper) {
    return NextResponse.json({ error: "题库不存在。" }, { status: 404 });
  }
  if (paper.questions.length === 0) {
    return NextResponse.json({ error: "当前题库还没有题目。" }, { status: 400 });
  }

  const ownerCourses = await prisma.learningCourse.findMany({
    where: ownerCourseWhere(paper.course),
    select: {
      id: true,
      name: true,
      syllabusItems: {
        where: { status: "published" },
        select: {
          id: true,
          parentId: true,
          code: true,
          title: true,
          description: true
        },
        orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }, { code: "asc" }]
      }
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
  });
  const candidates = buildCandidates(ownerCourses);

  if (candidates.length === 0) {
    return NextResponse.json({ error: "请先在知识点地图中维护当前题库所属专业或公共课的知识点。" }, { status: 400 });
  }

  const results: Array<{
    paperQuestionId: string;
    questionId: string;
    syllabusItemId?: string;
    ok: boolean;
    error?: string;
  }> = [];
  let tagged = 0;

  for (const item of paper.questions) {
    try {
      const selection: Selection | null = await classifyQuestion({
        paperTitle: paper.title,
        question: item.question,
        candidates
      });

      if (!selection) {
        throw new Error("AI 没有返回有效的候选知识点 ID。");
      }

      await saveAiTag({
        questionId: item.question.id,
        syllabusItemId: selection.id,
        confidence: selection.confidence,
        reason: selection.reason
      });

      tagged += 1;
      results.push({
        paperQuestionId: item.id,
        questionId: item.question.id,
        syllabusItemId: selection.id,
        ok: true
      });
    } catch (error) {
      results.push({
        paperQuestionId: item.id,
        questionId: item.question.id,
        ok: false,
        error: error instanceof Error ? error.message : "AI 打标失败。"
      });
    }
  }

  if (tagged > 0) {
    await prisma.examPaper.update({
      where: { id: paper.id },
      data: { updatedAt: new Date() }
    });
    revalidatePath(`/admin/question-banks/${paper.id}`);
  }

  return NextResponse.json({
    total: paper.questions.length,
    tagged,
    failed: paper.questions.length - tagged,
    results
  });
}
