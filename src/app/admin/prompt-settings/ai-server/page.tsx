import Link from "next/link";
import { AdminAiServerSettingsPanel } from "@/components/admin-ai-server-settings";
import { getAdminAiServerSettings } from "@/lib/ai-server-settings";
import { requireAdmin } from "@/lib/auth";

const noticeText: Record<string, string> = {
  "ai-server-saved": "AI 服务器配置已保存，后续新模型请求将使用当前选择。"
};

const errorText: Record<string, string> = {
  "invalid-ai-server-mode": "请选择内置或自定义 AI 服务器。",
  "invalid-ai-server-url": "API Base URL 必须是有效的 HTTP 或 HTTPS 地址，且不要包含账号密码。",
  "custom-ai-server-required": "启用自定义 AI 服务器前，请完整填写配置名称、API Base URL 和模型 ID。",
  "ai-server-value-too-long": "AI 服务器配置内容过长，请缩短后重试。",
  "ai-server-secret-unavailable": "无法加密 API Key，请先配置至少 24 字节的 AI_SERVER_CONFIG_SECRET 或 AUTH_SECRET。"
};

export default async function AdminAiServerSettingsPage({
  searchParams
}: {
  searchParams?: Promise<{ notice?: string; error?: string }>;
}) {
  await requireAdmin();
  const [params, settings] = await Promise.all([searchParams, getAdminAiServerSettings()]);
  const notice = params?.notice ? noticeText[params.notice] : null;
  const error = params?.error ? errorText[params.error] : null;

  return (
    <main className="space-y-4">
      <header>
        <h1 className="text-xl font-black text-ink">AI配置</h1>
        <p className="mt-1 text-sm font-semibold text-slate-500">管理闯关页、学习搭子 Prompt 与全局 AI 服务器。</p>
      </header>

      <nav className="flex gap-8 overflow-x-auto whitespace-nowrap border-b border-slate-200 text-sm font-bold text-slate-600" aria-label="AI配置导航">
        <Link className="border-b-2 border-transparent px-0 py-3 transition hover:border-teal hover:text-teal" href="/admin/prompt-settings">
          闯关页prompt
        </Link>
        <Link className="border-b-2 border-transparent px-0 py-3 transition hover:border-teal hover:text-teal" href="/admin/prompt-settings/study-buddy">
          学习搭子prompt
        </Link>
        <Link className="border-b-2 border-teal px-0 py-3 text-ink" href="/admin/prompt-settings/ai-server">
          AI服务器配置
        </Link>
      </nav>

      {notice ? <div className="rounded border border-teal/20 bg-teal/10 p-3 text-sm font-semibold text-teal">{notice}</div> : null}
      {error ? <div className="rounded border border-red-100 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div> : null}

      <AdminAiServerSettingsPanel settings={settings} />
    </main>
  );
}
