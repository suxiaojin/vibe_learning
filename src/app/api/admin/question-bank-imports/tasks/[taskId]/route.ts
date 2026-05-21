import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { assertImportQuestionPaperPayload, getQuestionPaperImportStats } from "@/lib/question-paper-import";

export const runtime = "nodejs";

function parserBaseUrl() {
  return (process.env.QUESTION_PDF_PARSER_URL || "http://172.18.255.14:8000").replace(/\/+$/, "");
}

async function requireAdminJson() {
  const user = await getCurrentUser();
  return user?.role === "admin";
}

export async function GET(
  _request: NextRequest,
  {
    params
  }: {
    params: Promise<{ taskId: string }>;
  }
) {
  if (!(await requireAdminJson())) {
    return NextResponse.json({ error: "未登录或没有权限。" }, { status: 401 });
  }

  const { taskId } = await params;
  const response = await fetch(`${parserBaseUrl()}/parse-question-paper-tasks/${encodeURIComponent(taskId)}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    const message = await response.text();
    return NextResponse.json(
      {
        error: `PDF 解析服务查询任务失败：${response.status}`,
        detail: message.slice(0, 1200)
      },
      { status: 502 }
    );
  }

  const task = (await response.json()) as { status?: string; payload?: unknown; stats?: Record<string, number> };
  if (task.status === "succeeded" && task.payload) {
    assertImportQuestionPaperPayload(task.payload);
    return NextResponse.json({
      ...task,
      stats: getQuestionPaperImportStats(task.payload)
    });
  }

  return NextResponse.json(task);
}
