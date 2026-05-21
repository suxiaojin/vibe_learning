import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  assertImportQuestionPaperPayload,
  getQuestionPaperImportStats,
  importQuestionPaperPayload,
  type ImportQuestionPaperPayload,
  type ImportQuestionPaperTarget
} from "@/lib/question-paper-import";
import type { QuestionBankOwnerType } from "@/lib/question-bank-catalog";

export const runtime = "nodejs";

function isOwnerType(value: unknown): value is QuestionBankOwnerType {
  return value === "public_subject" || value === "major";
}

async function requireAdminJson() {
  const user = await getCurrentUser();
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
  };

  assertImportQuestionPaperPayload(body.payload);
  const payload: ImportQuestionPaperPayload = body.payload;
  const target: ImportQuestionPaperTarget = {
    ownerType: isOwnerType(body.ownerType) ? body.ownerType : undefined,
    ownerId: typeof body.ownerId === "string" ? body.ownerId : undefined,
    regionId: typeof body.regionId === "string" ? body.regionId : undefined
  };
  const result = await importQuestionPaperPayload(payload, target);

  revalidatePath("/admin/question-banks");
  revalidatePath(`/admin/question-banks/${result.paperId}`);

  return NextResponse.json({
    ...result,
    stats: getQuestionPaperImportStats(payload)
  });
}
