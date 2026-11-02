import { revalidatePath } from "next/cache";
import { apiError, apiOk } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth";
import { answersEqual } from "@/lib/learning";
import { normalizeMockTestCourseKey } from "@/lib/mock-tests";
import { getPastExams } from "@/lib/past-exams";
import { isQuestionBankAutoGradedForOwner } from "@/lib/question-bank-types";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request, { params }: { params: Promise<{ paperId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return apiError("Authentication required.", 401, "UNAUTHORIZED");
  const body = await request.json().catch(() => null);
  const { paperId } = await params;
  if (!body || typeof body.runId !== "string" || !/^[a-f0-9]{32}$/i.test(body.runId) || !body.answers || typeof body.answers !== "object" || Array.isArray(body.answers)) return apiError("Invalid answers.", 400, "INVALID_ANSWERS");
  const courseKey = normalizeMockTestCourseKey(body.courseKey);
  const { ownerName, papers } = await getPastExams(user.id, courseKey, paperId);
  const paper = papers.find((item) => item.id === paperId);
  if (!paper || !ownerName) return apiError("Paper unavailable.", 404, "PAPER_NOT_FOUND");
  const data = paper.questions.flatMap(({ question }) => {
    const raw = body.answers[question.id];
    const answer = Array.isArray(raw) ? raw.filter((v: unknown): v is string => typeof v === "string").map((v: string) => v.trim().slice(0, 5000)).filter(Boolean).slice(0, 20) : [];
    if (!answer.length) return [];
    const auto = isQuestionBankAutoGradedForOwner(question.type, courseKey, ownerName, question.fillBlankScored);
    const correct = auto && answersEqual(answer, question.answer);
    return [{ id: `pe_${user.id}_${body.runId}_${question.id}`, userId: user.id, questionId: question.id, sessionId: null, selectedAnswer: answer, isCorrect: correct, gradingStatus: auto ? "auto_graded" as const : "ungraded" as const }];
  });
  if (!data.length) return apiError("No answers.", 400, "NO_ANSWERS");
  await prisma.questionAttempt.createMany({ data, skipDuplicates: true });
  // A retry may arrive after the first response was lost. Return the stored
  // attempts, not a new judgment of potentially different submitted answers.
  const saved = await prisma.questionAttempt.findMany({
    where: { userId: user.id, id: { in: data.map((item) => item.id) } },
    select: { questionId: true, selectedAnswer: true, isCorrect: true, gradingStatus: true }
  });
  const results: Record<string, "correct" | "wrong" | "submitted"> = {};
  const answers: Record<string, string[]> = {};
  for (const attempt of saved) {
    answers[attempt.questionId] = Array.isArray(attempt.selectedAnswer) ? attempt.selectedAnswer.filter((value): value is string => typeof value === "string") : [];
    results[attempt.questionId] = attempt.gradingStatus === "auto_graded" ? (attempt.isCorrect ? "correct" : "wrong") : "submitted";
  }
  revalidatePath("/me");
  return apiOk({ results, answers });
}
