import Link from "next/link";
import { RotateCcw, Save, Trash2 } from "lucide-react";
import {
  discardAiStudyOverviewPromptDraft as discardSecondLevelDraft,
  publishAiStudyOverviewPromptDraft as publishSecondLevelDraft,
  rollbackAiStudyOverviewPromptVersion as rollbackSecondLevelVersion,
  saveAiStudyOverviewPromptDraft as saveSecondLevelDraft
} from "@/app/admin/prompt-settings/study-buddy-overview/actions";
import {
  discardAiStudyOverviewPromptDraft as discardThirdLevelDraft,
  publishAiStudyOverviewPromptDraft as publishThirdLevelDraft,
  rollbackAiStudyOverviewPromptVersion as rollbackThirdLevelVersion,
  saveAiStudyOverviewPromptDraft as saveThirdLevelDraft
} from "@/app/admin/prompt-settings/study-buddy-level3-overview/actions";
import { normalizeAiStudyOverviewPromptTemplates } from "@/lib/ai-study-overview-prompt-template";
import { getAiStudyOverviewPromptProfileForAdmin, type AiStudyOverviewDepth } from "@/lib/ai-study-overview-prompts";

function formatPublishedAt(value: Date | null) {
  return value ? value.toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Shanghai" }) : "未发布";
}

export async function AdminAiStudyOverviewPromptSettings({
  depth,
  promptVersionId
}: {
  depth: AiStudyOverviewDepth;
  promptVersionId?: string;
}) {
  const thirdLevel = depth === 2;
  const label = thirdLevel ? "三层内容概述" : "二层内容概述";
  const section = thirdLevel ? "level3" : "level2";
  const saveDraft = thirdLevel ? saveThirdLevelDraft : saveSecondLevelDraft;
  const publishDraft = thirdLevel ? publishThirdLevelDraft : publishSecondLevelDraft;
  const discardDraft = thirdLevel ? discardThirdLevelDraft : discardSecondLevelDraft;
  const rollbackVersion = thirdLevel ? rollbackThirdLevelVersion : rollbackSecondLevelVersion;
  const profile = await getAiStudyOverviewPromptProfileForAdmin(depth);
  const draft = profile.versions.find((version) => !version.publishedAt) || null;
  const published = profile.versions.filter((version) => version.publishedAt);
  const selected = published.find((version) => version.id === promptVersionId) || null;
  const active = profile.activeVersion;
  if (!active) throw new Error(`${label} Prompt 初始化失败：没有线上版本。`);
  const editorSource = selected || draft || active;
  const templates = normalizeAiStudyOverviewPromptTemplates(editorSource.templates);
  const editorVersion = draft?.version || (profile.versions[0]?.version || 0) + 1;

  return (
    <div className="grid min-w-0 gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <div>
            <h3 className="text-lg font-black text-ink">{selected ? `${label} Prompt · 历史版本 v${selected.version}` : `${label} Prompt · 草稿 v${editorVersion}`}</h3>
            <p className="mt-1 text-xs font-semibold text-slate-500">保存只修改本组草稿；发布后新的{label}任务使用新版，不改写已生成内容。</p>
          </div>
          <span className="border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700">线上 v{active.version}</span>
        </header>
        <form action={saveDraft} className="space-y-4" key={editorSource.id}>
          <div className="border border-blue-200 bg-blue-50 p-4 text-xs font-semibold leading-6 text-blue-900">
            <p className="font-black">此配置只控制{label}节点的“内容概述”</p>
            <p>{thirdLevel ? "任务提供上级模块、下层知识点标题和原文摘录。" : "任务提供该模块下各分支、知识点标题和原文摘录。"} User 段用 {"{{context}}"} 注入资料；程序仍校验输出格式、长度与数值依据。</p>
          </div>
          <section className="border border-slate-200 bg-white">
            <header className="border-b border-slate-100 bg-slate-50 px-5 py-4"><h4 className="font-black text-ink">{label}</h4><p className="mt-1 text-xs font-semibold text-slate-500">System 和 User 同属本组，单独保存、发布。</p></header>
            <div className="divide-y divide-slate-100">
              <label className="block p-5"><span className="text-sm font-black text-ink">概述 · System</span><code className="ml-3 text-[11px] text-slate-400">overview.system</code><p className="mt-1 text-xs font-semibold text-slate-500">控制导读的内容、风格、覆盖范围及来源边界。</p><textarea className="input mt-3 min-h-56 rounded-none font-mono text-sm leading-6" name="template:overview.system" defaultValue={templates["overview.system"]} maxLength={30000} required /></label>
              <label className="block p-5"><span className="text-sm font-black text-ink">概述 · User</span><code className="ml-3 text-[11px] text-slate-400">overview.user</code><p className="mt-1 text-xs font-semibold text-slate-500">必须保留 {"{{context}}"}，由程序注入当前节点的下层内容与原文证据。</p><textarea className="input mt-3 min-h-40 rounded-none font-mono text-sm leading-6" name="template:overview.user" defaultValue={templates["overview.user"]} maxLength={30000} required /></label>
            </div>
          </section>
          <div className="flex justify-end border border-slate-200 bg-white p-4"><button className="primary-button min-w-44 justify-center rounded-none" type="submit"><Save size={16} />保存此组草稿 v{editorVersion}</button></div>
        </form>
      </div>
      <aside className="min-w-0 space-y-4">
        <section className="border border-slate-200 bg-white p-4 shadow-sm"><h3 className="font-black text-ink">生效规则</h3><div className="mt-3 space-y-2 text-xs font-semibold leading-5 text-slate-600"><p>发布后仅影响后续{label}模型调用，不需要再次重启 worker。</p><p>其余两组学习搭子 Prompt 和已生成内容不自动改写。</p><p>模型服务器在“AI服务器配置”中为{label}单独指定。</p></div></section>
        <form action={publishDraft} className="border border-slate-200 bg-white p-4 shadow-sm"><h3 className="font-black text-ink">发布此组</h3><label className="mt-4 block text-xs font-black text-slate-600">更改说明（必填）<textarea className="input mt-2 min-h-24 rounded-none font-semibold" maxLength={200} name="changeNote" required /></label><button className="primary-button mt-4 w-full justify-center rounded-none bg-emerald-600 hover:bg-emerald-700" disabled={!draft} type="submit">发布 v{editorVersion}</button>{!draft ? <p className="mt-2 text-center text-xs font-semibold text-amber-700">请先保存此组草稿，再发布。</p> : null}</form>
        <section className="border border-slate-200 bg-white p-4 shadow-sm"><h3 className="font-black text-ink">版本记录</h3><div className="mt-4 divide-y divide-slate-100 border border-slate-200">{published.map((version) => <div className="flex items-start gap-2 p-3" key={version.id}><Link className="min-w-0 flex-1" href={`/admin/prompt-settings/study-buddy?section=${section}&promptVersionId=${version.id}`}><p className="text-xs font-black text-ink">v{version.version}{version.id === active.id ? <span className="ml-1 bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700">当前线上</span> : null}</p><p className="mt-1 text-[11px] font-semibold text-slate-500">{formatPublishedAt(version.publishedAt)} · {version.createdByName || "管理员"}</p>{version.changeNote ? <p className="mt-2 text-xs font-semibold leading-5 text-slate-600">{version.changeNote}</p> : null}</Link>{version.id !== active.id && !draft ? <form action={rollbackVersion}><input name="versionId" type="hidden" value={version.id} /><button className="flex min-h-9 items-center gap-1 px-2 text-[11px] font-black text-blue-700 hover:bg-blue-50" type="submit"><RotateCcw size={13} />回滚</button></form> : null}</div>)}</div></section>
        {draft ? <form action={discardDraft}><button className="secondary-button w-full justify-center rounded-none border-red-100 text-red-600 hover:bg-red-50" type="submit"><Trash2 size={15} />放弃此组草稿 v{draft.version}</button></form> : null}
      </aside>
    </div>
  );
}
