import Link from "next/link";
import { RotateCcw, Save, Trash2 } from "lucide-react";
import {
  discardAiStudyPromptDraft,
  publishAiStudyPromptDraft,
  rollbackAiStudyPromptVersion,
  saveAiStudyPromptDraft
} from "@/app/admin/prompt-settings/study-buddy/actions";
import { AdminAiStudyPromptEditor } from "@/components/admin-ai-study-prompt-editor";
import { normalizeAiStudyPromptTemplates } from "@/lib/ai-study-prompt-template";
import { getAiStudyPromptProfileForAdmin } from "@/lib/ai-study-prompts";
import { cn } from "@/lib/utils";

function formatPublishedAt(value: Date | null) {
  if (!value) {
    return "未发布";
  }
  return value.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai"
  });
}

export async function AdminAiStudyPromptSettings({ promptVersionId }: { promptVersionId?: string }) {
  const profile = await getAiStudyPromptProfileForAdmin();
  const draft = profile.versions.find((version) => !version.publishedAt) || null;
  const publishedVersions = profile.versions.filter((version) => version.publishedAt);
  const selectedPublishedVersion = publishedVersions.find((version) => version.id === promptVersionId) || null;
  const activeVersion = profile.activeVersion;
  if (!activeVersion) {
    throw new Error("学习搭子Prompt初始化失败：没有线上版本。");
  }

  const editorVersion = draft?.version || (profile.versions[0]?.version || 0) + 1;
  const editorSource = selectedPublishedVersion || draft || activeVersion;
  const editorTemplates = normalizeAiStudyPromptTemplates(editorSource.templates);

  return (
    <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section className="min-w-0">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <div>
            <h2 className="text-lg font-black text-ink">
              {selectedPublishedVersion ? `历史版本 v${selectedPublishedVersion.version}` : `学习搭子 Prompt · 草稿 v${editorVersion}`}
            </h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              {selectedPublishedVersion
                ? `保存后会${draft ? `更新现有草稿 v${draft.version}` : `创建草稿 v${editorVersion}`}，不会覆盖历史版本。`
                : "新项目在提交时锁定版本；发布不会切换正在处理的项目，也不会重做历史大纲和卡片。"}
            </p>
          </div>
          <span className="border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700">
            线上 v{activeVersion.version}
          </span>
        </header>

        <form action={saveAiStudyPromptDraft}>
          <AdminAiStudyPromptEditor
            key={editorSource.id}
            initialTemplates={editorTemplates}
          />
          <div className="sticky bottom-0 z-10 mt-4 flex justify-end border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur">
            <button className="primary-button min-w-44 justify-center rounded-none" type="submit">
              <Save size={16} />保存草稿 v{editorVersion}
            </button>
          </div>
        </form>
      </section>

      <aside className="min-w-0 space-y-4">
        <section className="border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-black text-ink">生效规则</h2>
          <div className="mt-3 space-y-2 text-xs font-semibold leading-5 text-slate-600">
            <p>新提交项目立即使用新版本，并在整个大纲、卡片生成期间保持同一版本。</p>
            <p>问问搭子从发布后的下一条提问开始使用新版。</p>
            <p>已有项目、卡片和聊天记录不会自动重生成。</p>
          </div>
        </section>

        <form action={publishAiStudyPromptDraft} className="border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-black text-ink">发布设置</h2>
          <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">发布会原子切换线上版本，不需要重启worker。</p>
          <label className="mt-4 block text-xs font-black text-slate-600">
            更改说明（必填）
            <textarea className="input mt-2 min-h-24 rounded-none font-semibold" maxLength={200} name="changeNote" placeholder="例如：优化长文档四层大纲拆分策略" required />
          </label>
          <button className="primary-button mt-4 w-full justify-center rounded-none bg-emerald-600 hover:bg-emerald-700" disabled={!draft} type="submit">
            发布 v{editorVersion}
          </button>
          {!draft ? <p className="mt-2 text-center text-xs font-semibold text-amber-700">请先保存草稿，再发布新版本。</p> : null}
        </form>

        <section className="border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-black text-ink">版本记录</h2>
          <div className="mt-4 divide-y divide-slate-100 border border-slate-200">
            {publishedVersions.map((version) => {
              const active = version.id === activeVersion.id;
              const selected = version.id === selectedPublishedVersion?.id;
              return (
                <div className={cn("flex items-start gap-2 p-3", selected ? "bg-blue-50 ring-1 ring-inset ring-blue-300" : "hover:bg-slate-50")} key={version.id}>
                  <Link className="min-w-0 flex-1" href={`/admin/prompt-settings/study-buddy?promptVersionId=${version.id}`}>
                    <p className="text-xs font-black text-ink">
                      v{version.version}
                      {active ? <span className="ml-1 bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700">当前线上</span> : null}
                    </p>
                    <p className="mt-1 text-[11px] font-semibold text-slate-500">{formatPublishedAt(version.publishedAt)} · {version.createdByName || "管理员"}</p>
                    <p className="mt-1 break-all text-[10px] font-semibold text-slate-400">{version.sourceVersion}</p>
                    {version.changeNote ? <p className="mt-2 text-xs font-semibold leading-5 text-slate-600">{version.changeNote}</p> : null}
                  </Link>
                  {!active && !draft ? (
                    <form action={rollbackAiStudyPromptVersion}>
                      <input name="versionId" type="hidden" value={version.id} />
                      <button className="flex min-h-9 items-center gap-1 px-2 text-[11px] font-black text-blue-700 hover:bg-blue-50" type="submit">
                        <RotateCcw size={13} />回滚
                      </button>
                    </form>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>

        {draft ? (
          <form action={discardAiStudyPromptDraft}>
            <button className="secondary-button w-full justify-center rounded-none border-red-100 text-red-600 hover:bg-red-50" type="submit">
              <Trash2 size={15} />放弃草稿 v{draft.version}
            </button>
          </form>
        ) : null}
      </aside>
    </section>
  );
}
