import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { EnglishPaperError, englishPaperEdit, englishPaperInclude, planEnglishPaperEdit, readEnglishPaper } from "@/lib/english-v1-paper";
import { prisma } from "@/lib/prisma";

export async function PUT(request: Request) {
  if ((await getCurrentAdmin())?.role !== "admin") {
    return NextResponse.json({ error: "未登录或没有权限。" }, { status: 401 });
  }

  const edit = englishPaperEdit.safeParse(await request.json().catch(() => null));
  if (!edit.success) return NextResponse.json({ error: "保存内容格式不正确。" }, { status: 400 });

  const { paperId } = edit.data;
  try {
    const sample = await prisma.$transaction(async (tx) => {
      const paper = await tx.examPaper.findFirst({
        where: { id: paperId, questionBankStructure: "english_v1" },
        include: englishPaperInclude
      });
      if (!paper) return null;

      const updates = planEnglishPaperEdit(paper, edit.data);
      for (const { id, data } of updates) {
        const otherPaper = await tx.examPaperQuestion.findFirst({
          where: { questionId: id, paperId: { not: paperId } }, select: { id: true }
        });
        if (otherPaper) throw new EnglishPaperError("此题同时被其他题库引用，无法从当前题库单独修改。");
        await tx.question.update({ where: { id }, data });
      }
      if (!updates.length) return readEnglishPaper(paper).sample;
      const updated = await tx.examPaper.update({
        where: { id: paperId }, data: { updatedAt: new Date() }, include: englishPaperInclude
      });
      return readEnglishPaper(updated).sample;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (!sample) return NextResponse.json({ error: "未找到英语 V1 题库。" }, { status: 404 });

    revalidatePath("/admin/question-banks");
    revalidatePath("/admin/question-banks/" + paperId);
    return NextResponse.json(sample);
  } catch (error) {
    if (error instanceof EnglishPaperError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json({ error: "题库正在被更新，请刷新后再保存。" }, { status: 409 });
    }
    console.error("英语 V1 题库保存失败", error);
    return NextResponse.json({ error: "保存失败，请重试。" }, { status: 500 });
  }
}
