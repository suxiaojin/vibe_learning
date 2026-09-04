import Link from "next/link";
import { AdminAiStudyPromptSettings } from "@/components/admin-ai-study-prompt-settings";
import { requireAdmin } from "@/lib/auth";

const noticeText: Record<string, string> = {
  "draft-saved": "学习搭子Prompt草稿已保存；发布后才会影响新项目和新提问。",
  "version-published": "学习搭子Prompt新版本已发布，后续调用立即生效。",
  "draft-discarded": "学习搭子Prompt草稿已放弃。",
  "version-rolled-back": "已通过新版本安全回滚学习搭子Prompt。"
};

const errorText: Record<string, string> = {
  "invalid-template": "Prompt无效，请检查全部15个片段、必要变量和长度限制。",
  "invalid-publish-note": "发布前请填写1到200个字的更改说明。",
  "draft-not-found": "没有可以发布的Prompt草稿，请先保存草稿。",
  "version-not-found": "目标Prompt版本不存在。",
  "discard-draft-before-rollback": "当前还有未发布草稿，请先发布或放弃草稿，再执行回滚。"
};

export default async function AdminAiStudyPromptSettingsPage({
  searchParams
}: {
  searchParams?: Promise<{ notice?: string; error?: string; promptVersionId?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const notice = params?.notice ? noticeText[params.notice] : null;
  const error = params?.error ? errorText[params.error] : null;

  return (
    <main className="space-y-4">
      <header>
        <h1 className="text-xl font-black text-ink">提示词设置</h1>
        <p className="mt-1 text-sm font-semibold text-slate-500">管理闯关页和学习搭子的Prompt草稿、发布与历史版本。</p>
      </header>

      <nav className="flex gap-8 overflow-x-auto whitespace-nowrap border-b border-slate-200 text-sm font-bold text-slate-600" aria-label="提示词设置导航">
        <Link className="border-b-2 border-transparent px-0 py-3 transition hover:border-teal hover:text-teal" href="/admin/prompt-settings">
          闯关页prompt
        </Link>
        <Link className="border-b-2 border-teal px-0 py-3 text-ink" href="/admin/prompt-settings/study-buddy">
          学习搭子prompt
        </Link>
      </nav>

      {notice ? <div className="rounded border border-teal/20 bg-teal/10 p-3 text-sm font-semibold text-teal">{notice}</div> : null}
      {error ? <div className="rounded border border-red-100 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div> : null}

      <AdminAiStudyPromptSettings promptVersionId={params?.promptVersionId} />
    </main>
  );
}
