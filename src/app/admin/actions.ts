"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ContentStatus, Difficulty, QuestionType } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { parseJsonField } from "@/lib/learning";
import { prisma } from "@/lib/prisma";

export async function createChapter(formData: FormData) {
  await requireAdmin();
  const subject = await prisma.subject.findFirstOrThrow({ where: { province: "江苏", examType: "专转本", name: "计算机" } });
  await prisma.chapter.create({
    data: {
      subjectId: subject.id,
      title: String(formData.get("title") || "").trim(),
      sortOrder: Number(formData.get("sortOrder") || 0),
      status: String(formData.get("status") || "draft") as ContentStatus
    }
  });
  revalidatePath("/admin/chapters");
  redirect("/admin/chapters");
}

export async function updateChapterStatus(formData: FormData) {
  await requireAdmin();
  await prisma.chapter.update({
    where: { id: String(formData.get("id")) },
    data: { status: String(formData.get("status")) as ContentStatus }
  });
  revalidatePath("/admin/chapters");
}

export async function createKnowledgePoint(formData: FormData) {
  await requireAdmin();
  await prisma.knowledgePoint.create({
    data: {
      chapterId: String(formData.get("chapterId")),
      title: String(formData.get("title") || "").trim(),
      summary: String(formData.get("summary") || "").trim(),
      content: String(formData.get("content") || "").trim(),
      sortOrder: Number(formData.get("sortOrder") || 0),
      estimatedMinutes: Number(formData.get("estimatedMinutes") || 8),
      status: String(formData.get("status") || "draft") as ContentStatus
    }
  });
  revalidatePath("/admin/knowledge-points");
  redirect("/admin/knowledge-points");
}

export async function updateKnowledgePointStatus(formData: FormData) {
  await requireAdmin();
  await prisma.knowledgePoint.update({
    where: { id: String(formData.get("id")) },
    data: { status: String(formData.get("status")) as ContentStatus }
  });
  revalidatePath("/admin/knowledge-points");
}

export async function createQuestion(formData: FormData) {
  await requireAdmin();
  await prisma.question.create({
    data: {
      knowledgePointId: String(formData.get("knowledgePointId")),
      type: String(formData.get("type")) as QuestionType,
      stem: String(formData.get("stem") || "").trim(),
      options: parseJsonField(formData.get("options"), []),
      answer: parseJsonField(formData.get("answer"), []),
      analysis: String(formData.get("analysis") || "").trim(),
      source: String(formData.get("source") || "人工录入").trim(),
      difficulty: String(formData.get("difficulty") || "medium") as Difficulty,
      status: String(formData.get("status") || "draft") as ContentStatus
    }
  });
  revalidatePath("/admin/questions");
  redirect("/admin/questions");
}

export async function updateQuestionStatus(formData: FormData) {
  await requireAdmin();
  await prisma.question.update({
    where: { id: String(formData.get("id")) },
    data: { status: String(formData.get("status")) as ContentStatus }
  });
  revalidatePath("/admin/questions");
}
