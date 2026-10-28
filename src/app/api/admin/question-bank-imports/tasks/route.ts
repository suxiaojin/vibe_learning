import { NextRequest, NextResponse } from "next/server";
import { getAiServerConfigForModule } from "@/lib/ai-server-settings";
import { getCurrentAdmin } from "@/lib/auth";
import registry from "@/lib/question-pdf-parser-versions.json";
import { isParserVersion, parserVersionUrl } from "@/lib/question-pdf-parser-versions";

export const runtime = "nodejs";

function isUploadFile(value: FormDataEntryValue | null): value is File {
  return Boolean(value && typeof value === "object" && "arrayBuffer" in value && "name" in value);
}

async function requireAdminJson() {
  const user = await getCurrentAdmin();
  return user?.role === "admin";
}

export async function POST(request: NextRequest) {
  if (!(await requireAdminJson())) {
    return NextResponse.json({ error: "未登录或没有权限。" }, { status: 401 });
  }

  const formData = await request.formData();
  const questionPdf = formData.get("questionPdf");
  const answerPdf = formData.get("answerPdf");
  const parserVersion = String(formData.get("parserVersion") || registry.defaultVersion);
  if (!isParserVersion(parserVersion)) {
    return NextResponse.json({ error: "请选择有效的解析版本。" }, { status: 400 });
  }

  if (!isUploadFile(questionPdf)) {
    return NextResponse.json({ error: "请上传真题 PDF。" }, { status: 400 });
  }
  if (answerPdf !== null && !isUploadFile(answerPdf)) {
    return NextResponse.json({ error: "答案解析 PDF 格式不正确。" }, { status: 400 });
  }

  const outbound = new FormData();
  outbound.append("question_pdf", questionPdf, questionPdf.name);
  if (answerPdf) {
    outbound.append("answer_pdf", answerPdf, answerPdf.name);
  }

  const fieldMap: Record<string, string> = {
    title: "title",
    year: "year",
    regionName: "region_name",
    ownerName: "owner_name",
    ownerType: "owner_type",
    courseName: "course_name"
  };

  Object.entries(fieldMap).forEach(([sourceKey, targetKey]) => {
    const value = String(formData.get(sourceKey) || "").trim();
    if (value) {
      outbound.append(targetKey, value);
    }
  });

  const aiServer = await getAiServerConfigForModule("question_bank_pdf_ai_review");
  outbound.append("ai_api_base_url", aiServer.baseUrl);
  outbound.append("ai_api_key", aiServer.apiKey);
  outbound.append("ai_model", aiServer.model);

  let response: Response;
  try {
    response = await fetch(`${parserVersionUrl(parserVersion)}/parse-question-paper-tasks`, { method: "POST", body: outbound });
  } catch {
    return NextResponse.json({ error: "所选解析版本的服务不可用，请检查题库解析版本状态。" }, { status: 503 });
  }

  if (!response.ok) {
    const message = await response.text();
    return NextResponse.json(
      {
        error: `PDF 解析服务创建任务失败：${response.status}`,
        detail: message.slice(0, 1200)
      },
      { status: 502 }
    );
  }

  const task = await response.json() as { taskId?: string };
  if (!task.taskId || !/^[a-f0-9]{12}$/.test(task.taskId)) return NextResponse.json({ error: "解析服务返回无效任务编号。" }, { status: 502 });
  return NextResponse.json({ ...task, taskId: `${parserVersion}~${task.taskId}`, parserVersion });
}
