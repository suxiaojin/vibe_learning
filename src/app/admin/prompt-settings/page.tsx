import Link from "next/link";
import { AdminAiPromptSettings } from "@/components/admin-ai-prompt-settings";
import { requireAdmin } from "@/lib/auth";

const noticeText: Record<string, string> = {
  "prompt-profile-created": "Prompt 档案已创建，请继续完善并发布。",
  "prompt-profile-deleted": "Prompt 档案已删除，原绑定专业将使用通用兜底 Prompt。",
  "prompt-draft-saved": "Prompt 草稿已保存；发布后才会影响后续新生成内容。",
  "prompt-version-published": "Prompt 新版本已发布。",
  "prompt-version-history-deleted": "历史版本已删除，当前线上版本未改变。",
  "prompt-version-active-replaced": "当前线上版本已删除，已自动切换到剩余版本中版本号最高的一版。",
  "prompt-version-active-fallback": "最后一个线上版本已删除，该档案将回退使用通用 AI解释。",
  "prompt-draft-discarded": "Prompt 草稿已放弃。",
  "prompt-version-rolled-back": "已通过新版本安全回滚 Prompt。",
  "prompt-course-bound": "专业已绑定到该 Prompt 档案。",
  "prompt-course-unbound": "专业已解除绑定，将使用通用兜底 Prompt。"
};

const errorText: Record<string, string> = {
  "invalid-prompt-profile-name": "Prompt 档案名称不能为空且不能超过 80 个字。",
  "duplicate-prompt-profile-name": "已经存在同名 Prompt 档案。",
  "invalid-prompt-template": "Prompt 模板无效，请检查必要变量、未知变量和长度限制。",
  "prompt-profile-not-found": "Prompt 档案不存在。",
  "prompt-default-profile-cannot-delete": "通用 AI解释是系统兜底档案，不能删除。",
  "invalid-prompt-publish-note": "发布前请填写 1 到 200 个字的更改说明。",
  "prompt-draft-not-found": "没有可以发布的 Prompt 草稿，请先保存草稿。",
  "prompt-version-not-found": "目标 Prompt 版本不存在或已删除。",
  "prompt-default-version-cannot-delete": "通用 AI解释是系统兜底档案，其版本不能删除。",
  "prompt-discard-draft-before-rollback": "当前还有未发布草稿，请先发布或放弃草稿，再执行回滚。",
  "prompt-course-binding-invalid": "Prompt 档案、区域学制或专业不存在，无法完成绑定。"
};

export default async function AdminPromptSettingsPage({
  searchParams
}: {
  searchParams?: Promise<{
    notice?: string;
    error?: string;
    promptProfileId?: string;
    promptVersionId?: string;
    promptQuery?: string;
    promptStatus?: string;
  }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const notice = params?.notice ? noticeText[params.notice] : null;
  const error = params?.error ? errorText[params.error] : null;

  return (
    <main className="space-y-4">
      <header>
        <h1 className="text-xl font-black text-ink">提示词设置</h1>
        <p className="mt-1 text-sm font-semibold text-slate-500">管理闯关页 AI 解释提示词档案、专业绑定和版本发布。</p>
      </header>

      <nav className="flex gap-8 overflow-x-auto whitespace-nowrap border-b border-slate-200 text-sm font-bold text-slate-600" aria-label="提示词设置导航">
        <Link className="border-b-2 border-teal px-0 py-3 text-ink" href="/admin/prompt-settings">
          闯关页prompt
        </Link>
      </nav>

      {notice ? <div className="rounded border border-teal/20 bg-teal/10 p-3 text-sm font-semibold text-teal">{notice}</div> : null}
      {error ? <div className="rounded border border-red-100 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div> : null}

      <AdminAiPromptSettings
        promptProfileId={params?.promptProfileId}
        promptQuery={params?.promptQuery}
        promptStatus={params?.promptStatus}
        promptVersionId={params?.promptVersionId}
      />
    </main>
  );
}
