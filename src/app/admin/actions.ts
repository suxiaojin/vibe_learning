"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ContentStatus, Difficulty, QuestionType } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type QuestionOption = {
  key: string;
  text: string;
};

const optionKeys = ["A", "B", "C", "D"] as const;

function getStatus(formData: FormData) {
  return String(formData.get("status") || "draft") as ContentStatus;
}

function getQuestionType(formData: FormData) {
  return String(formData.get("type") || "single_choice") as QuestionType;
}

function buildQuestionOptions(formData: FormData): QuestionOption[] {
  return optionKeys
    .map((key) => ({
      key,
      text: String(formData.get(`option${key}`) || "").trim()
    }))
    .filter((option) => option.text.length > 0);
}

function buildQuestionAnswer(formData: FormData, type: QuestionType) {
  const selected = formData
    .getAll("answer")
    .map((item) => String(item).trim())
    .filter(Boolean);

  if (selected.length === 0) {
    return ["A"];
  }

  return type === "multiple_choice" ? selected.sort() : [selected[0]];
}

export async function createChapter(formData: FormData) {
  await requireAdmin();
  const subject = await prisma.subject.findFirstOrThrow({
    where: { province: "江苏", examType: "专转本", name: "计算机" }
  });
  await prisma.chapter.create({
    data: {
      subjectId: subject.id,
      title: String(formData.get("title") || "").trim(),
      sortOrder: Number(formData.get("sortOrder") || 0),
      status: getStatus(formData)
    }
  });
  revalidatePath("/admin/chapters");
  redirect("/admin/chapters");
}

export async function updateChapterStatus(formData: FormData) {
  await requireAdmin();
  await prisma.chapter.update({
    where: { id: String(formData.get("id")) },
    data: { status: getStatus(formData) }
  });
  revalidatePath("/admin/chapters");
}

export async function updateChapter(formData: FormData) {
  await requireAdmin();
  await prisma.chapter.update({
    where: { id: String(formData.get("id")) },
    data: {
      title: String(formData.get("title") || "").trim(),
      sortOrder: Number(formData.get("sortOrder") || 0),
      status: getStatus(formData)
    }
  });
  revalidatePath("/admin/chapters");
  redirect("/admin/chapters");
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
      status: getStatus(formData)
    }
  });
  revalidatePath("/admin/knowledge-points");
  redirect("/admin/knowledge-points");
}

export async function updateKnowledgePointStatus(formData: FormData) {
  await requireAdmin();
  await prisma.knowledgePoint.update({
    where: { id: String(formData.get("id")) },
    data: { status: getStatus(formData) }
  });
  revalidatePath("/admin/knowledge-points");
}

export async function updateKnowledgePoint(formData: FormData) {
  await requireAdmin();
  await prisma.knowledgePoint.update({
    where: { id: String(formData.get("id")) },
    data: {
      chapterId: String(formData.get("chapterId")),
      title: String(formData.get("title") || "").trim(),
      summary: String(formData.get("summary") || "").trim(),
      content: String(formData.get("content") || "").trim(),
      sortOrder: Number(formData.get("sortOrder") || 0),
      estimatedMinutes: Number(formData.get("estimatedMinutes") || 8),
      status: getStatus(formData)
    }
  });
  revalidatePath("/admin/knowledge-points");
  redirect("/admin/knowledge-points");
}

export async function createQuestion(formData: FormData) {
  await requireAdmin();
  const type = getQuestionType(formData);
  const knowledgePointId = String(formData.get("knowledgePointId"));
  await prisma.question.create({
    data: {
      knowledgePointId,
      type,
      stem: String(formData.get("stem") || "").trim(),
      options: buildQuestionOptions(formData),
      answer: buildQuestionAnswer(formData, type),
      analysis: String(formData.get("analysis") || "").trim(),
      source: String(formData.get("source") || "人工录入").trim(),
      difficulty: String(formData.get("difficulty") || "medium") as Difficulty,
      status: getStatus(formData)
    }
  });
  revalidatePath("/admin/questions");
  redirect(`/admin/questions?knowledgePointId=${encodeURIComponent(knowledgePointId)}`);
}

export async function updateQuestion(formData: FormData) {
  await requireAdmin();
  const type = getQuestionType(formData);
  await prisma.question.update({
    where: { id: String(formData.get("id")) },
    data: {
      knowledgePointId: String(formData.get("knowledgePointId")),
      type,
      stem: String(formData.get("stem") || "").trim(),
      options: buildQuestionOptions(formData),
      answer: buildQuestionAnswer(formData, type),
      analysis: String(formData.get("analysis") || "").trim(),
      source: String(formData.get("source") || "人工录入").trim(),
      difficulty: String(formData.get("difficulty") || "medium") as Difficulty,
      status: getStatus(formData)
    }
  });
  revalidatePath("/admin/questions");
  redirect("/admin/questions");
}

export async function updateQuestionStatus(formData: FormData) {
  await requireAdmin();
  await prisma.question.update({
    where: { id: String(formData.get("id")) },
    data: { status: getStatus(formData) }
  });
  revalidatePath("/admin/questions");
}
