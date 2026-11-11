import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import {
  assertImportQuestionPaperPayload,
  assertQuestionPaperCommit,
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
    questionBankStructure?: unknown;
  };

  const questionBankStructure = body.questionBankStructure ?? "general_v1";
  if (questionBankStructure !== "general_v1" && questionBankStructure !== "english_v1") {
    return NextResponse.json({ error: "题库结构无效。" }, { status: 400 });
  }

  const target: ImportQuestionPaperTarget = {
    ownerType: isOwnerType(body.ownerType) ? body.ownerType : undefined,
    ownerId: typeof body.ownerId === "string" ? body.ownerId : undefined,
    regionId: typeof body.regionId === "string" ? body.regionId : undefined,
    questionBankStructure
  };
  if (questionBankStructure === "english_v1" && (!target.ownerType || !target.ownerId || !target.regionId)) {
    return NextResponse.json({ error: "请选择题库所属科目或专业和区域。" }, { status: 400 });
  }
  let payload: ImportQuestionPaperPayload;
  try {
    assertImportQuestionPaperPayload(body.payload);
    payload = body.payload;
    assertQuestionPaperCommit(payload, questionBankStructure);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "导入数据无效。" }, { status: 400 });
  }
  const result = await importQuestionPaperPayload(payload, target);

  revalidatePath("/admin/question-banks");
  revalidatePath(`/admin/question-banks/${result.paperId}`);

  return NextResponse.json({
    ...result,
    stats: getQuestionPaperImportStats(payload)
  });
}
