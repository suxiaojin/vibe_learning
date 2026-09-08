import { NextRequest, NextResponse } from "next/server";
import { getActiveAiServerConfig } from "@/lib/ai-server-settings";
import { getCurrentAdmin } from "@/lib/auth";
import { assertImportQuestionPaperPayload, getQuestionPaperImportStats } from "@/lib/question-paper-import";

export const runtime = "nodejs";

function parserBaseUrl() {
  return (process.env.QUESTION_PDF_PARSER_URL || "http://172.18.255.14:8000").replace(/\/+$/, "");
}

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

  if (!isUploadFile(questionPdf) || !isUploadFile(answerPdf)) {
    return NextResponse.json({ error: "请上传真题 PDF 和答案解析 PDF。" }, { status: 400 });
  }

  const outbound = new FormData();
  outbound.append("question_pdf", questionPdf, questionPdf.name);
  outbound.append("answer_pdf", answerPdf, answerPdf.name);

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

  const aiServer = await getActiveAiServerConfig();
  outbound.append("ai_api_base_url", aiServer.baseUrl);
  outbound.append("ai_api_key", aiServer.apiKey);
  outbound.append("ai_model", aiServer.model);

  const response = await fetch(`${parserBaseUrl()}/parse-question-paper`, {
    method: "POST",
    body: outbound
  });

  if (!response.ok) {
    const message = await response.text();
    return NextResponse.json(
      {
        error: `PDF 解析服务返回错误：${response.status}`,
        detail: message.slice(0, 1200)
      },
      { status: 502 }
    );
  }

  const parsed = (await response.json()) as { payload?: unknown; warnings?: string[] } | unknown;
  const payload = parsed && typeof parsed === "object" && "payload" in parsed ? (parsed as { payload: unknown }).payload : parsed;
  assertImportQuestionPaperPayload(payload);

  return NextResponse.json({
    payload,
    stats: getQuestionPaperImportStats(payload),
    warnings: parsed && typeof parsed === "object" && "warnings" in parsed && Array.isArray((parsed as { warnings?: unknown }).warnings) ? (parsed as { warnings: string[] }).warnings : []
  });
}
