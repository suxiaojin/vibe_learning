import Link from "next/link";
import { RotateCcw, Save, Trash2 } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { getAiStudyOverviewPromptProfileForAdmin } from "@/lib/ai-study-overview-prompts";
import { normalizeAiStudyOverviewPromptTemplates } from "@/lib/ai-study-overview-prompt-template";
import {
  discardAiStudyOverviewPromptDraft,
  publishAiStudyOverviewPromptDraft,
  rollbackAiStudyOverviewPromptVersion,
  saveAiStudyOverviewPromptDraft
} from "./actions";

const notices: Record<string, string> = {
  "draft-saved": "二层内容概述 Prompt 草稿已保存；发布后才会影响新的概述任务。",
  "version-published": "二层内容概述 Prompt 已发布，后续任务将使用新版。",
  "draft-discarded": "二层内容概述 Prompt 草稿已放弃。",
  "version-rolled-back": "已通过新版本回滚二层内容概述 Prompt。"
};
const errors: Record<string, string> = {
  "invalid-template": "Prompt 无效：System 和 User 均不能为空，User 必须包含 {{context}}，且不能使用其他变量。",
  "invalid-publish-note": "发布前请填写 1 到 200 个字的更改说明。",
  "draft-not-found": "没有可发布的草稿，请先保存。",
  "version-not-found": "目标版本不存在。",
  "discard-draft-before-rollback": "当前有未发布草稿，请先发布或放弃后再回滚。"
};

function formatPublishedAt(value: Date | null) {
  return value ? value.toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Shanghai" }) : "未发布";
}

export default async function AdminAiStudyOverviewPromptPage({
  searchParams
}: { searchParams?: Promise<{ notice?: string; error?: string; promptVersionId?: string }> }) {
  await requireAdmin();
  const [params, profile] = await Promise.all([searchParams, getAiStudyOverviewPromptProfileForAdmin()]);
  const draft = profile.versions.find((version) => !version.publishedAt) || null;
  const published = profile.versions.filter((version) => version.publishedAt);
  const selected = published.find((version) => version.id === params?.promptVersionId) || null;
  const active = profile.activeVersion;
  if (!active) throw new Error("二层内容概述 Prompt 初始化失败：没有线上版本。");
  const editorSource = selected || draft || active;
  const templates = normalizeAiStudyOverviewPromptTemplates(editorSource.templates);
  const editorVersion = draft?.version || (profile.versions[0]?.version || 0) + 1;

  return <main className="space-y-4">
    <header>
      <h1 className="text-xl font-black text-ink">AI配置</h1>
      <p className="mt-1 text-sm font-semibold text-slate-500">管理闯关页、问问搭子、二层内容概述 Prompt 与全局 AI 服务器。</p>
    </header>
    <nav className="flex gap-8 overflow-x-auto whitespace-nowrap border-b border-slate-200 text-sm font-bold text-slate-600" aria-label="AI配置导航">
      <Link className="border-b-2 border-transparent px-0 py-3 transition hover:border-teal hover:text-teal" href="/admin/prompt-settings">闯关页prompt</Link>
      <Link className="border-b-2 border-transparent px-0 py-3 transition hover:border-teal hover:text-teal" href="/admin/prompt-settings/study-buddy">问问搭子prompt</Link>
      <Link className="border-b-2 border-teal px-0 py-3 text-ink" href="/admin/prompt-settings/study-buddy-overview">二层内容概述prompt</Link>
      <Link className="border-b-2 border-transparent px-0 py-3 transition hover:border-teal hover:text-teal" href="/admin/prompt-settings/ai-server">AI服务器配置</Link>
    </nav>
    {params?.notice && notices[params.notice] ? <div className="rounded border border-teal/20 bg-teal/10 p-3 text-sm font-semibold text-teal">{notices[params.notice]}</div> : null}
    {params?.error && errors[params.error] ? <div className="rounded border border-red-100 bg-red-50 p-3 text-sm font-semibold text-red-700">{errors[params.error]}</div> : null}
    <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <div>
            <h2 className="text-lg font-black text-ink">{selected ? `二层内容概述 Prompt · 历史版本 v${selected.version}` : `二层内容概述 Prompt · 草稿 v${editorVersion}`}</h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">保存只修改本模块草稿；发布后，新的二层概述任务使用新版，不改写已生成内容。</p>
          </div>
          <span className="border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700">线上 v{active.version}</span>
        </header>
        <form action={saveAiStudyOverviewPromptDraft} className="space-y-4" key={editorSource.id}>
          <div className="border border-blue-200 bg-blue-50 p-4 text-xs font-semibold leading-6 text-blue-900">
            <p className="font-black">此页只控制二层节点的“内容概述”</p>
            <p>任务会提供该模块下各分支、知识点标题和原文摘录。User 段用 {"{{context}}"} 注入这些资料；程序仍校验输出格式、长度与数值依据。</p>
          </div>
          <section className="border border-slate-200 bg-white">
            <header className="border-b border-slate-100 bg-slate-50 px-5 py-4"><h3 className="font-black text-ink">二层内容概述</h3><p className="mt-1 text-xs font-semibold text-slate-500">System 和 User 同属本模块，独立保存、发布。</p></header>
            <div className="divide-y divide-slate-100">
              <label className="block p-5"><span className="text-sm font-black text-ink">概述 · System</span><code className="ml-3 text-[11px] text-slate-400">overview.system</code><p className="mt-1 text-xs font-semibold text-slate-500">控制导读的内容、风格、覆盖范围及来源边界。</p><textarea className="input mt-3 min-h-56 rounded-none font-mono text-sm leading-6" name="template:overview.system" defaultValue={templates["overview.system"]} maxLength={30000} required /></label>
              <label className="block p-5"><span className="text-sm font-black text-ink">概述 · User</span><code className="ml-3 text-[11px] text-slate-400">overview.user</code><p className="mt-1 text-xs font-semibold text-slate-500">必须保留 {"{{context}}"}，由程序注入当前二层节点的下层内容与原文证据。</p><textarea className="input mt-3 min-h-40 rounded-none font-mono text-sm leading-6" name="template:overview.user" defaultValue={templates["overview.user"]} maxLength={30000} required /></label>
            </div>
          </section>
          <div className="sticky bottom-0 z-10 flex justify-end border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur"><button className="primary-button min-w-44 justify-center rounded-none" type="submit"><Save size={16} />保存草稿 v{editorVersion}</button></div>
        </form>
      </div>
      <aside className="min-w-0 space-y-4">
        <section className="border border-slate-200 bg-white p-4 shadow-sm"><h2 className="font-black text-ink">生效规则</h2><div className="mt-3 space-y-2 text-xs font-semibold leading-5 text-slate-600"><p>发布后由后续二层概述模型调用读取，不需要再次重启 worker。</p><p>不影响问问搭子、目录解析或第四层 AI 详解；已生成概述不自动重写。</p><p>使用现有“AI详解”模型路由，Prompt 版本单独记录在卡片上。</p></div></section>
        <form action={publishAiStudyOverviewPromptDraft} className="border border-slate-200 bg-white p-4 shadow-sm"><h2 className="font-black text-ink">发布设置</h2><label className="mt-4 block text-xs font-black text-slate-600">更改说明（必填）<textarea className="input mt-2 min-h-24 rounded-none font-semibold" maxLength={200} name="changeNote" required /></label><button className="primary-button mt-4 w-full justify-center rounded-none bg-emerald-600 hover:bg-emerald-700" disabled={!draft} type="submit">发布 v{editorVersion}</button>{!draft ? <p className="mt-2 text-center text-xs font-semibold text-amber-700">请先保存草稿，再发布新版本。</p> : null}</form>
        <section className="border border-slate-200 bg-white p-4 shadow-sm"><h2 className="font-black text-ink">版本记录</h2><div className="mt-4 divide-y divide-slate-100 border border-slate-200">{published.map((version) => <div className="flex items-start gap-2 p-3" key={version.id}><Link className="min-w-0 flex-1" href={`/admin/prompt-settings/study-buddy-overview?promptVersionId=${version.id}`}><p className="text-xs font-black text-ink">v{version.version}{version.id === active.id ? <span className="ml-1 bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700">当前线上</span> : null}</p><p className="mt-1 text-[11px] font-semibold text-slate-500">{formatPublishedAt(version.publishedAt)} · {version.createdByName || "管理员"}</p>{version.changeNote ? <p className="mt-2 text-xs font-semibold leading-5 text-slate-600">{version.changeNote}</p> : null}</Link>{version.id !== active.id && !draft ? <form action={rollbackAiStudyOverviewPromptVersion}><input name="versionId" type="hidden" value={version.id} /><button className="flex min-h-9 items-center gap-1 px-2 text-[11px] font-black text-blue-700 hover:bg-blue-50" type="submit"><RotateCcw size={13} />回滚</button></form> : null}</div>)}</div></section>
        {draft ? <form action={discardAiStudyOverviewPromptDraft}><button className="secondary-button w-full justify-center rounded-none border-red-100 text-red-600 hover:bg-red-50" type="submit"><Trash2 size={15} />放弃草稿 v{draft.version}</button></form> : null}
      </aside>
    </section>
  </main>;
}
