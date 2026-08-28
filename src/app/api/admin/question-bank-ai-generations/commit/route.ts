import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import {
  assertImportQuestionPaperPayload,
  getQuestionPaperImportStats,
  importQuestionPaperPayload,
  type ImportQuestionPaperPayload,
  type ImportQuestionPaperTarget
} from "@/lib/question-paper-import";
import type { QuestionBankOwnerType } from "@/lib/question-bank-catalog";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function isOwnerType(value: unknown): value is QuestionBankOwnerType {
  return value === "public_subject" || value === "major";
}

function ownerCourseWhere(ownerType: QuestionBankOwnerType, ownerId: string, regionId: string) {
  return ownerType === "public_subject"
    ? { courseType: ownerType, publicSubjectId: ownerId, regionId }
    : { courseType: ownerType, majorId: ownerId, regionId };
}

function uniqueValues(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

async function validReferenceChapterIds(ownerType: QuestionBankOwnerType, ownerId: string, regionId: string, ids: string[]) {
  const courses = await prisma.learningCourse.findMany({
    where: ownerCourseWhere(ownerType, ownerId, regionId),
    select: {
      syllabusItems: {
        where: { checkpointScope: null },
        select: {
          id: true,
          parentId: true
        }
      }
    }
  });
  const validIds = new Set<string>();

  courses.forEach((course) => {
    const childrenByParent = new Map<string | null, string[]>();
    course.syllabusItems.forEach((item) => {
      const children = childrenByParent.get(item.parentId) || [];
      children.push(item.id);
      childrenByParent.set(item.parentId, children);
    });
    (childrenByParent.get(null) || []).forEach((chapterId) => {
      validIds.add(chapterId);
    });
  });

  return ids.filter((id) => validIds.has(id));
}

async function requireAdminJson() {
  const user = await getCurrentAdmin();
  return user?.role === "admin";
}

export async function POST(request: NextRequest) {
  if (!(await requireAdminJson())) {
    return NextResponse.json({ error: "未登录或没有权限。" }, { status: 401 });
  }

  const body = (await request.json()) as {
    payload?: unknown;
    ownerType?: unknown;
    ownerId?: unknown;
    regionId?: unknown;
    referenceChapterIds?: unknown;
  };

  const ownerType = isOwnerType(body.ownerType) ? body.ownerType : undefined;
  const ownerId = typeof body.ownerId === "string" ? body.ownerId : undefined;
  const regionId = typeof body.regionId === "string" ? body.regionId : undefined;
  if (!ownerType || !ownerId || !regionId) {
    return NextResponse.json({ error: "缺少专业、公共课或区域信息。" }, { status: 400 });
  }

  const referenceChapterIds = Array.isArray(body.referenceChapterIds)
    ? uniqueValues(body.referenceChapterIds.map((item) => String(item || "")))
    : [];
  if (referenceChapterIds.length === 0) {
    return NextResponse.json({ error: "AI 生题缺少知识点标签，请重新选择参考章节后生成。" }, { status: 400 });
  }

  const allowedChapterIds = await validReferenceChapterIds(ownerType, ownerId, regionId, referenceChapterIds);
  if (allowedChapterIds.length !== referenceChapterIds.length) {
    return NextResponse.json({ error: "AI 生题参考章节不存在，或不属于当前专业/区域。" }, { status: 400 });
  }

  assertImportQuestionPaperPayload(body.payload);
  const payload = body.payload as ImportQuestionPaperPayload;
  const aiPayload: ImportQuestionPaperPayload = {
    ...payload,
    paperType: "practice_set",
    chapterTitle: payload.chapterTitle || "AI生成题",
    knowledgePointTitle: payload.knowledgePointTitle || "AI模拟真题",
    questions: payload.questions.map((question, index) => {
      const questionTagIds = uniqueValues([question.syllabusItemId, ...(question.syllabusItemIds || [])]).filter((id) => allowedChapterIds.includes(id));
      return {
        ...question,
        syllabusItemId: questionTagIds[0] || allowedChapterIds[index % allowedChapterIds.length],
        syllabusItemIds: questionTagIds.length > 0 ? questionTagIds : [allowedChapterIds[index % allowedChapterIds.length]],
        source: question.source || payload.title || "AI模拟真题",
        sourceType: "ai_generated"
      };
    })
  };
  const target: ImportQuestionPaperTarget = {
    ownerType,
    ownerId,
    regionId
  };
  const result = await importQuestionPaperPayload(aiPayload, target, { defaultSourceType: "ai_generated", defaultKnowledgeTagSource: "ai" });

  revalidatePath("/admin/question-banks");
  revalidatePath(`/admin/question-banks/${result.paperId}`);

  return NextResponse.json({
    ...result,
    stats: getQuestionPaperImportStats(aiPayload)
  });
}
