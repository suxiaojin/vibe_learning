import { revalidatePath } from "next/cache";
import { apiError, apiOk } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth";
import { EnglishPaperError, readEnglishPaper } from "@/lib/english-v1-paper";
import { getHenanEnglishPastExam } from "@/lib/henan-english-past-exams";
import { prisma } from "@/lib/prisma";
import { englishImportSections } from "@/lib/question-bank-types";

function readText(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 5000) : "";
}

function normalizeCorrection(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export async function GET(request: Request, { params }: { params: Promise<{ paperId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return apiError("请登录后查看解析。", 401, "UNAUTHORIZED");
  const runId = new URL(request.url).searchParams.get("runId");
  if (!runId || !/^[a-f0-9]{32}$/i.test(runId)) return apiError("答卷格式有误。", 400, "INVALID_RUN");

  const { paperId } = await params;
  const paper = await getHenanEnglishPastExam(user.id, paperId);
  if (!paper) return apiError("当前试卷不可用。", 404, "PAPER_NOT_FOUND");
  let rows;
  try {
    rows = readEnglishPaper(paper).groups.flatMap((group) => group.rows);
  } catch (error) {
    if (!(error instanceof EnglishPaperError)) throw error;
    return apiError("当前试卷的题型结构无法读取。", 422, "INVALID_PAPER");
  }
  const runPrefix = `english_pe_${user.id}_${paper.id}_${runId.toLowerCase()}_`;
  const attempt = await prisma.questionAttempt.findFirst({
    where: { userId: user.id, id: { in: rows.map((row) => runPrefix + row.entry.question.id) } },
    select: { id: true }
  });
  if (!attempt) return apiError("找不到已提交的答卷。", 404, "ATTEMPT_NOT_FOUND");

  const analyses = Object.fromEntries(
    rows.filter((row) => row.section === "correction").map((row) => [row.entry.question.id, row.explanation])
  );
  return apiOk({ analyses }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request, { params }: { params: Promise<{ paperId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return apiError("请登录后再提交。", 401, "UNAUTHORIZED");
  const body = await request.json().catch(() => null);
  if (!body || typeof body.runId !== "string" || !/^[a-f0-9]{32}$/i.test(body.runId) ||
      !body.answers || typeof body.answers !== "object" || Array.isArray(body.answers)) {
    return apiError("答卷格式有误，请刷新页面后重试。", 400, "INVALID_ANSWERS");
  }

  const { paperId } = await params;
  const paper = await getHenanEnglishPastExam(user.id, paperId);
  if (!paper) return apiError("当前试卷不可用。", 404, "PAPER_NOT_FOUND");
  let rows;
  try {
    rows = readEnglishPaper(paper).groups.flatMap((group) => group.rows);
  } catch (error) {
    if (!(error instanceof EnglishPaperError)) throw error;
    return apiError("当前试卷的题型结构无法读取。", 422, "INVALID_PAPER");
  }

  const runPrefix = `english_pe_${user.id}_${paper.id}_${body.runId.toLowerCase()}_`;
  const references: Record<string, { answer: string; analysis: string }> = {};
  const data = rows.flatMap((row) => {
    const { question } = row.entry;
    references[question.id] = {
      answer: row.answer,
      analysis: row.section === "correction" || question.showAnalysis ? row.explanation : ""
    };

    const raw = body.answers[question.id];
    if (!Array.isArray(raw)) return [];
    const isCorrection = row.section === "correction";
    const position = isCorrection && raw.length === 2 ? readText(raw[0]) : "";
    const selectedAnswer = isCorrection
      ? [/^[A-D]$/.test(position) ? position : "", readText(raw.length === 2 ? raw[1] : raw[0])]
      : [readText(raw[0])];
    if (!selectedAnswer.some(Boolean)) return [];
    const auto = isCorrection
      ? Boolean(row.correctionAnswer && row.correction.trim())
      : Boolean(englishImportSections[row.section].options) && Object.hasOwn(row.options, row.answer);
    const isCorrect = auto && (isCorrection
      ? selectedAnswer[0] === row.correctionAnswer && normalizeCorrection(selectedAnswer[1]) === normalizeCorrection(row.correction)
      : selectedAnswer[0] === row.answer);
    return [{
      id: runPrefix + question.id,
      userId: user.id,
      questionId: question.id,
      selectedAnswer,
      isCorrect,
      gradingStatus: auto ? "auto_graded" as const : "ungraded" as const
    }];
  });

  const saved = await prisma.$transaction(async (tx) => {
    // Keep the first complete submission for this run, even when a retry overlaps it.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${runPrefix}, 0))`;
    const query = {
      where: { userId: user.id, id: { in: rows.map((row) => runPrefix + row.entry.question.id) } },
      select: { questionId: true, selectedAnswer: true, isCorrect: true, gradingStatus: true }
    } as const;
    const existing = await tx.questionAttempt.findMany(query);
    if (existing.length || !data.length) return existing;
    await tx.questionAttempt.createMany({ data });
    return tx.questionAttempt.findMany(query);
  });
  if (!saved.length) return apiError("请至少回答一道题后再提交。", 400, "NO_ANSWERS");

  const results: Record<string, "correct" | "wrong" | "submitted"> = {};
  const answers: Record<string, string[]> = {};
  for (const attempt of saved) {
    answers[attempt.questionId] = Array.isArray(attempt.selectedAnswer)
      ? attempt.selectedAnswer.filter((value): value is string => typeof value === "string") : [];
    results[attempt.questionId] = attempt.gradingStatus === "auto_graded"
      ? (attempt.isCorrect ? "correct" : "wrong") : "submitted";
  }
  revalidatePath("/me");
  return apiOk({ results, answers, references });
}
