import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { AdminAiStudyOverviewPromptSettings } from "@/components/admin-ai-study-overview-prompt-settings";
import { AdminAiStudyPromptSettings } from "@/components/admin-ai-study-prompt-settings";
import { requireAdmin } from "@/lib/auth";

type PromptSection = "chat" | "level2" | "level3";

const notices: Record<string, string> = {
  "draft-saved": "此组 Prompt 草稿已保存；发布后才会影响新的模型调用。",
  "version-published": "此组 Prompt 已发布，后续模型调用将使用新版。",
  "draft-discarded": "此组 Prompt 草稿已放弃。",
  "version-rolled-back": "已通过新版本回滚此组 Prompt。"
};
const errors: Record<string, string> = {
  "invalid-template": "Prompt 无效，请检查必填内容、变量和长度限制。",
  "invalid-publish-note": "发布前请填写 1 到 200 个字的更改说明。",
  "draft-not-found": "没有可发布的草稿，请先保存此组配置。",
  "version-not-found": "目标版本不存在。",
  "discard-draft-before-rollback": "当前有未发布草稿，请先发布或放弃后再回滚。"
};

function sectionFrom(value: string | undefined): PromptSection | null {
  return value === "chat" || value === "level2" || value === "level3" ? value : null;
}

function PromptGroup({
  children,
  description,
  label,
  open
}: {
  children: ReactNode;
  description: string;
  label: string;
  open: boolean;
}) {
  return (
    <details className="group border border-slate-200 bg-white shadow-sm" open={open}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="block text-base font-black text-ink">{label}</span>
          <span className="mt-1 block text-xs font-semibold text-slate-500">{description}</span>
        </span>
        <ChevronDown className="shrink-0 text-slate-500 transition-transform group-open:rotate-180" size={18} />
      </summary>
      <div className="border-t border-slate-200 bg-slate-50/60">{children}</div>
    </details>
  );
}

export default async function AdminAiStudyPromptSettingsPage({
  searchParams
}: {
  searchParams?: Promise<{ section?: string; notice?: string; error?: string; promptVersionId?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const section = sectionFrom(params?.section) || (params?.promptVersionId ? "chat" : null);
  const notice = section && params?.notice ? notices[params.notice] : null;
  const error = section && params?.error ? errors[params.error] : null;

  return (
    <main className="space-y-4">
      <header>
        <h1 className="text-xl font-black text-ink">AI配置</h1>
        <p className="mt-1 text-sm font-semibold text-slate-500">学习搭子的三组 Prompt 分别保存、发布和回滚。</p>
      </header>
      <nav className="flex gap-8 overflow-x-auto whitespace-nowrap border-b border-slate-200 text-sm font-bold text-slate-600" aria-label="AI配置导航">
        <Link className="border-b-2 border-transparent px-0 py-3 transition hover:border-teal hover:text-teal" href="/admin/prompt-settings">闯关页prompt</Link>
        <Link className="border-b-2 border-teal px-0 py-3 text-ink" href="/admin/prompt-settings/study-buddy">学习搭子prompt</Link>
        <Link className="border-b-2 border-transparent px-0 py-3 transition hover:border-teal hover:text-teal" href="/admin/prompt-settings/ai-server">AI服务器配置</Link>
      </nav>
      {notice ? <div className="rounded border border-teal/20 bg-teal/10 p-3 text-sm font-semibold text-teal">{notice}</div> : null}
      {error ? <div className="rounded border border-red-100 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div> : null}
      <div className="space-y-3">
        <PromptGroup description="控制问问搭子的对话回答，单独保存与发布。" label="问问搭子" open={section === "chat"}>
          <div className="p-4"><AdminAiStudyPromptSettings promptVersionId={section === "chat" ? params?.promptVersionId : undefined} /></div>
        </PromptGroup>
        <PromptGroup description="控制第二层节点的内容概述，单独保存与发布。" label="二层内容概述" open={section === "level2"}>
          <AdminAiStudyOverviewPromptSettings depth={1} promptVersionId={section === "level2" ? params?.promptVersionId : undefined} />
        </PromptGroup>
        <PromptGroup description="控制第三层节点的内容概述，单独保存与发布。" label="三层内容概述" open={section === "level3"}>
          <AdminAiStudyOverviewPromptSettings depth={2} promptVersionId={section === "level3" ? params?.promptVersionId : undefined} />
        </PromptGroup>
      </div>
    </main>
  );
}
