import { NextResponse } from "next/server";
import { apiError, apiOk } from "@/lib/api-response";
import { getStudentApiUser } from "@/lib/student-api";
import { diamondInsufficientMessage } from "@/lib/diamond-insufficient";
import { InsufficientDiamondBalanceError } from "@/lib/rewards";
import { StudyProjectAccessError } from "@/lib/study-project-access";
import {
  purchaseStudyProject, studyProjectPurchaseSchema, StudyProjectPriceChangedError, StudyProjectConfirmationRequiredError
} from "@/lib/study-project-purchase";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { user, response } = await getStudentApiUser();
  if (!user) return response;
  // This endpoint has financial side effects; only same-origin JSON requests are accepted.
  const origin = request.headers.get("origin");
  const host = request.headers.get("host") || new URL(request.url).host;
  if (request.headers.get("sec-fetch-site") === "cross-site" ||
      (origin && URL.canParse(origin) && new URL(origin).host !== host) ||
      (origin && !URL.canParse(origin))) {
    return apiError("请求来源不合法。", 403, "INVALID_ORIGIN");
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return apiError("请使用 JSON 请求。", 415, "INVALID_CONTENT_TYPE");
  }
  const parsed = studyProjectPurchaseSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("购买参数不合法。", 400, "INVALID_PURCHASE_INPUT");
  try {
    return apiOk(await purchaseStudyProject(user.id, parsed.data), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof InsufficientDiamondBalanceError) {
      return apiError(diamondInsufficientMessage, 402, "STUDY_PROJECT_INSUFFICIENT_DIAMONDS");
    }
    if (error instanceof StudyProjectPriceChangedError || error instanceof StudyProjectConfirmationRequiredError) {
      return NextResponse.json({
        ok: false,
        error: {
          code: error instanceof StudyProjectPriceChangedError ? "STUDY_PROJECT_PRICE_CHANGED" : "STUDY_PROJECT_CONFIRMATION_REQUIRED",
          message: error.message
        },
        data: { offer: error.offer }
      }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }
    if (error instanceof StudyProjectAccessError) return apiError(error.message, error.status, error.code);
    throw error;
  }
}
