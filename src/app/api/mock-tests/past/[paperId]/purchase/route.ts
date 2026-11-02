import { NextResponse } from "next/server";
import { apiError, apiOk } from "@/lib/api-response";
import { getStudentApiUser } from "@/lib/student-api";
import { diamondInsufficientMessage } from "@/lib/diamond-insufficient";
import { InsufficientDiamondBalanceError } from "@/lib/rewards";
import { PastExamPurchaseError, pastExamPurchaseSchema, purchasePastExam } from "@/lib/past-exam-purchase";

export async function POST(request: Request, { params }: { params: Promise<{ paperId: string }> }) {
  const { user, response } = await getStudentApiUser();
  if (!user) return response;
  const origin = request.headers.get("origin");
  const host = request.headers.get("host") || new URL(request.url).host;
  if (request.headers.get("sec-fetch-site") === "cross-site" || (origin && (!URL.canParse(origin) || new URL(origin).host !== host))) return apiError("请求来源不合法。", 403, "INVALID_ORIGIN");
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return apiError("请使用 JSON 请求。", 415, "INVALID_CONTENT_TYPE");
  const parsed = pastExamPurchaseSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("购买参数不合法。", 400, "INVALID_PURCHASE_INPUT");
  try {
    const { paperId } = await params;
    return apiOk(await purchasePastExam(user.id, paperId, parsed.data), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof InsufficientDiamondBalanceError) return apiError(diamondInsufficientMessage, 402, "PAST_EXAM_INSUFFICIENT_DIAMONDS");
    if (error instanceof PastExamPurchaseError) return NextResponse.json({ ok: false, error: { message: error.message, code: error.code }, ...(error.offer ? { data: { offer: error.offer } } : {}) }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    throw error;
  }
}
