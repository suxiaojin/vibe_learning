import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getCurrentAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function PUT(request: Request, { params }: { params: Promise<{ paperId: string }> }) {
  const user = await getCurrentAdmin();
  if (user?.role !== "admin") return NextResponse.json({ error: "未登录或没有权限。" }, { status: 401 });
  const { paperId } = await params;
  const body = await request.json().catch(() => null) as { paperQuestionId?: unknown; reviewMarked?: unknown } | null;
  if (typeof body?.paperQuestionId !== "string" || !body.paperQuestionId || typeof body.reviewMarked !== "boolean") {
    return NextResponse.json({ error: "标记参数不正确。" }, { status: 400 });
  }
  const result = await prisma.examPaperQuestion.updateMany({
    where: { id: body.paperQuestionId, paperId },
    data: { reviewMarked: body.reviewMarked }
  });
  if (!result.count) return NextResponse.json({ error: "题目不存在或不属于当前题库。" }, { status: 404 });
  revalidatePath(`/admin/question-banks/${paperId}`);
  return NextResponse.json({ reviewMarked: body.reviewMarked });
}
