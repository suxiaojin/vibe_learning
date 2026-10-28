import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { assertImportQuestionPaperPayload, getQuestionPaperImportStats } from "@/lib/question-paper-import";
import { isParserVersion, parserVersionUrl } from "@/lib/question-pdf-parser-versions";

export const runtime = "nodejs";

function parserBaseUrl() {
  return (process.env.QUESTION_PDF_PARSER_URL || "http://172.18.255.14:8000").replace(/\/+$/, "");
}

async function requireAdminJson() {
  const user = await getCurrentAdmin();
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
  const parts = taskId.split("~");
  const version = parts.length === 2 ? parts[0] : "";
  const rawTaskId = parts.length === 2 ? parts[1] : taskId;
  if ((version && !isParserVersion(version)) || parts.length > 2 || !/^[a-f0-9]{12}$/.test(rawTaskId)) {
    return NextResponse.json({ error: "无效的解析任务编号。" }, { status: 400 });
  }
  const base = version && isParserVersion(version) ? parserVersionUrl(version) : parserBaseUrl();
  let response: Response;
  try {
    response = await fetch(`${base}/parse-question-paper-tasks/${encodeURIComponent(rawTaskId)}`, { cache: "no-store" });
  } catch {
    return NextResponse.json({ error: "解析任务对应的版本服务不可用，请稍后重试。" }, { status: 503 });
  }

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
      taskId,
      ...(version ? { parserVersion: version } : {}),
      stats: getQuestionPaperImportStats(task.payload)
    });
  }

  return NextResponse.json({ ...task, taskId, ...(version ? { parserVersion: version } : {}) });
}
