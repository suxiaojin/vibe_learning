import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getCurrentAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { askQwen, type ChatMessage } from "@/lib/qwen";

export const runtime = "nodejs";
export const maxDuration = 120;

type RouteContext = {
  params: Promise<{
    paperId: string;
    questionId: string;
  }>;
};

async function requireAdminJson() {
  const user = await getCurrentAdmin();
  return user?.role === "admin";
}

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

async function getQuestionForAdmin(paperId: string, questionId: string) {
  return prisma.examPaperQuestion.findFirst({
    where: {
      paperId,
      questionId
    },
    select: {
      question: {
        select: {
          id: true,
          type: true,
          stem: true,
          options: true,
          answer: true,
          analysis: true,
          aiDoubtAnswer: true,
          knowledgePoint: {
            select: {
              title: true,
              summary: true,
              content: true
            }
          }
        }
      },
      paper: {
        select: {
          title: true,
          major: { select: { name: true } },
          publicSubject: { select: { name: true } }
        }
      }
    }
  });
}

export async function POST(_request: Request, context: RouteContext) {
  if (!(await requireAdminJson())) {
    return NextResponse.json({ error: "未登录或没有权限。" }, { status: 401 });
  }

  const { paperId, questionId } = await context.params;
  const record = await getQuestionForAdmin(paperId, questionId);
  if (!record) {
    return NextResponse.json({ error: "题目不存在或不属于当前题库。" }, { status: 404 });
  }

  try {
    const answer = await askQwen(buildAiDoubtMessages(record), {
      temperature: 0.2,
      timeoutMs: 60_000
    });

    return NextResponse.json({ answer });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI 服务暂时不可用";
    return NextResponse.json({ error: `AI 答疑生成失败：${message}` }, { status: 503 });
  }
}

export async function PUT(request: Request, context: RouteContext) {
  if (!(await requireAdminJson())) {
    return NextResponse.json({ error: "未登录或没有权限。" }, { status: 401 });
  }

  const { paperId, questionId } = await context.params;
  const record = await getQuestionForAdmin(paperId, questionId);
  if (!record) {
    return NextResponse.json({ error: "题目不存在或不属于当前题库。" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as { answer?: unknown } | null;
  const answer = String(body?.answer || "").trim();

  await prisma.question.update({
    where: { id: questionId },
    data: { aiDoubtAnswer: answer || null }
  });

  revalidatePath(`/admin/question-banks/${paperId}`);
  return NextResponse.json({ answer });
}

function buildAiDoubtMessages(record: NonNullable<Awaited<ReturnType<typeof getQuestionForAdmin>>>): ChatMessage[] {
  const question = record.question;

  return [
    {
      role: "system",
      content: [
        "你是一个面向江苏专转本学生的学习助教。",
        "请为后台管理员生成这道题的学生端 AI 答疑草稿，管理员会审核后再发布给学生。",
        "必须输出纯文本，不要使用 Markdown 标记，不要使用 **、#、代码块、表格语法。",
        "结构固定为：解析：、解题步骤：、答案：。",
        "表达要准确、简洁、适合学生理解。"
      ].join("\n")
    },
    {
      role: "user",
      content: [
        `题库：${record.paper.title}`,
        `题库范围：${record.paper.major?.name || record.paper.publicSubject?.name || "未设置"}`,
        `知识点：${question.knowledgePoint?.title || "未打标"}`,
        `知识点摘要：${question.knowledgePoint?.summary || ""}`,
        `知识点正文：${stripHtml(question.knowledgePoint?.content || "")}`,
        `题型：${question.type}`,
        `题干：${stripHtml(question.stem)}`,
        `选项：${JSON.stringify(question.options)}`,
        `正确答案：${JSON.stringify(question.answer)}`,
        `原解析：${stripHtml(question.analysis)}`,
        question.aiDoubtAnswer ? `当前已保存 AI 答疑：${question.aiDoubtAnswer}` : ""
      ]
        .filter(Boolean)
        .join("\n\n")
    }
  ];
}
