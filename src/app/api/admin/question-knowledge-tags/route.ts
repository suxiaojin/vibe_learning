import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getCurrentAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type SyllabusItemRow = {
  id: string;
  parentId: string | null;
};

type PaperScope = {
  ownerType: "public_subject" | "major";
  publicSubjectId: string | null;
  majorId: string | null;
  regionId: string;
};

async function requireAdminJson() {
  const user = await getCurrentAdmin();
  return user?.role === "admin";
}

function ownerCourseWhere(scope: PaperScope) {
  return scope.ownerType === "public_subject"
    ? { courseType: "public_subject" as const, publicSubjectId: scope.publicSubjectId, regionId: scope.regionId }
    : { courseType: "major" as const, majorId: scope.majorId, regionId: scope.regionId };
}

function buildDisplayIdMap(items: SyllabusItemRow[]) {
  const itemById = new Map(items.map((item) => [item.id, item]));
  const displayIdById = new Map<string, string>();

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

  items.forEach((item) => {
    const ancestors = ancestorsFor(item);
    const displayItems = ancestors.slice(0, 2);
    const displayTarget = displayItems[displayItems.length - 1] || item;
    displayIdById.set(item.id, displayTarget.id);
  });

  return displayIdById;
}

async function linkedKnowledgePointId(syllabusItemId: string) {
  const point = await prisma.knowledgePoint.findFirst({
    where: { syllabusItemId },
    select: { id: true }
  });

  return point?.id || null;
}

async function linkedKnowledgePointIdInTransaction(tx: Prisma.TransactionClient, syllabusItemId: string) {
  const point = await tx.knowledgePoint.findFirst({
    where: { syllabusItemId },
    select: { id: true }
  });

  return point?.id || null;
}

export async function POST(request: NextRequest) {
  if (!(await requireAdminJson())) {
    return NextResponse.json({ error: "未登录或没有权限。" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    paperId?: unknown;
    questionId?: unknown;
    syllabusItemId?: unknown;
    action?: unknown;
  } | null;
  const paperId = typeof body?.paperId === "string" ? body.paperId : "";
  const questionId = typeof body?.questionId === "string" ? body.questionId : "";
  const submittedSyllabusItemId = typeof body?.syllabusItemId === "string" ? body.syllabusItemId : "";
  const action = body?.action === "delete" ? "delete" : body?.action === "add" ? "add" : "";

  if (!paperId || !questionId || !submittedSyllabusItemId || !action) {
    return NextResponse.json({ error: "缺少题目或知识点信息。" }, { status: 400 });
  }

  const paperQuestion = await prisma.examPaperQuestion.findFirst({
    where: {
      paperId,
      questionId
    },
    select: {
      paperId: true,
      paper: {
        select: {
          ownerType: true,
          publicSubjectId: true,
          majorId: true,
          regionId: true
        }
      },
      question: {
        select: {
          syllabusItemId: true
        }
      }
    }
  });

  if (!paperQuestion) {
    return NextResponse.json({ error: "题目不属于当前题库。" }, { status: 404 });
  }

  const syllabusItems = await prisma.syllabusItem.findMany({
    where: {
      status: "published",
      course: ownerCourseWhere(paperQuestion.paper)
    },
    select: {
      id: true,
      parentId: true
    }
  });
  const displayIdById = buildDisplayIdMap(syllabusItems);
  const targetDisplayId = displayIdById.get(submittedSyllabusItemId);

  if (!targetDisplayId) {
    return NextResponse.json({ error: "知识点不属于当前题库所属专业或公共课。" }, { status: 400 });
  }

  if (action === "add") {
    const pointId = await linkedKnowledgePointId(targetDisplayId);

    await prisma.$transaction(async (tx) => {
      const existing = await tx.questionKnowledgeTag.findUnique({
        where: {
          questionId_syllabusItemId: {
            questionId,
            syllabusItemId: targetDisplayId
          }
        },
        select: { id: true }
      });

      if (existing) {
        await tx.questionKnowledgeTag.update({
          where: { id: existing.id },
          data: {
            source: "manual",
            confidence: null,
            reason: null
          }
        });
      } else {
        await tx.questionKnowledgeTag.create({
          data: {
            questionId,
            syllabusItemId: targetDisplayId,
            source: "manual"
          }
        });
      }

      await tx.question.update({
        where: { id: questionId },
        data: {
          syllabusItemId: targetDisplayId,
          knowledgePointId: pointId
        }
      });
    });
  } else {
    const idsToDelete = [
      ...new Set(syllabusItems.filter((item) => displayIdById.get(item.id) === targetDisplayId).map((item) => item.id))
    ];
    const currentDisplayId = paperQuestion.question.syllabusItemId ? displayIdById.get(paperQuestion.question.syllabusItemId) : null;

    await prisma.$transaction(async (tx) => {
      await tx.questionKnowledgeTag.deleteMany({
        where: {
          questionId,
          syllabusItemId: { in: idsToDelete }
        }
      });

      if (currentDisplayId === targetDisplayId) {
        const remainingTag = await tx.questionKnowledgeTag.findFirst({
          where: { questionId },
          select: { syllabusItemId: true },
          orderBy: [{ source: "desc" }, { createdAt: "asc" }]
        });
        const nextSyllabusItemId = remainingTag?.syllabusItemId || null;
        const nextPointId = nextSyllabusItemId ? await linkedKnowledgePointIdInTransaction(tx, nextSyllabusItemId) : null;

        await tx.question.update({
          where: { id: questionId },
          data: {
            syllabusItemId: nextSyllabusItemId,
            knowledgePointId: nextPointId
          }
        });
      }
    });
  }

  await prisma.examPaper.update({
    where: { id: paperId },
    data: { updatedAt: new Date() }
  });
  revalidatePath(`/admin/question-banks/${paperId}`);

  return NextResponse.json({ ok: true });
}
