import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { parserVersionUrl } from "@/lib/question-pdf-parser-versions";

export async function PUT(request: Request) {
  const user = await getCurrentAdmin();
  if (user?.role !== "admin") return NextResponse.json({ error: "未登录或没有权限。" }, { status: 401 });

  try {
    const response = await fetch(`${parserVersionUrl("english")}/english-v1/sample`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: await request.text(),
      cache: "no-store",
      signal: AbortSignal.timeout(5000)
    });
    const result = await response.json();
    if (!response.ok) {
      return NextResponse.json({
        error: typeof result.detail === "string" ? result.detail : "请检查题干、选项和答案后重试。"
      }, { status: response.status });
    }
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "暂时无法保存测试样本，请稍后重试。" }, { status: 503 });
  }
}
