import Link from "next/link";
import { Link2, Plus, RotateCcw, Save, Trash2, X } from "lucide-react";
import {
  createAiExplainPromptProfile,
  deleteAiExplainPromptProfile,
  deleteAiExplainPromptVersion,
  discardAiExplainPromptDraft,
  publishAiExplainPromptDraft,
  rollbackAiExplainPromptVersion,
  saveAiExplainPromptDraft,
  unbindMajorAiExplainPrompt
} from "@/app/admin/settings/prompt-actions";
import { AdminAiPromptEditor } from "@/components/admin-ai-prompt-editor";
import { AdminAiPromptMajorBindingForm } from "@/components/admin-ai-prompt-major-binding-form";
import { AdminAiPromptProfileDeleteButton } from "@/components/admin-ai-prompt-profile-delete-button";
import { AdminAiPromptVersionDeleteButton } from "@/components/admin-ai-prompt-version-delete-button";
import {
  defaultAiExplainSystemPrompt,
  defaultAiExplainUserPromptTemplate
} from "@/lib/ai-explain-prompt-template";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";

function promptHref(profileId: string, query: string, status: string, versionId?: string) {
  const params = new URLSearchParams({ tab: "prompt", promptProfileId: profileId });
  if (versionId) {
    params.set("promptVersionId", versionId);
  }
  if (query) {
    params.set("promptQuery", query);
  }
  if (status !== "all") {
    params.set("promptStatus", status);
  }
  return `/admin/settings?${params.toString()}`;
}

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

function regionMajorLabel(regionMajor: { region: { name: string }; major: { name: string } }) {
  return `${regionMajor.region.name} · ${regionMajor.major.name}`;
}

export async function AdminAiPromptSettings({
  promptProfileId,
  promptQuery = "",
  promptStatus = "all",
  promptVersionId
}: {
  promptProfileId?: string;
  promptQuery?: string;
  promptStatus?: string;
  promptVersionId?: string;
}) {
  const [profiles, regionMajorOptions] = await Promise.all([
    prisma.aiExplainPromptProfile.findMany({
      include: {
        activeVersion: true,
        versions: { orderBy: { version: "desc" } },
        regionMajors: {
          include: { region: true, major: true },
          orderBy: [{ region: { sortOrder: "asc" } }, { major: { sortOrder: "asc" } }]
        }
      },
      orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }]
    }),
    prisma.regionMajor.findMany({
      where: { region: { status: "active" }, major: { status: "published" } },
      include: { region: true, major: true, aiExplainPromptProfile: true },
      orderBy: [{ region: { sortOrder: "asc" } }, { major: { sortOrder: "asc" } }]
    })
  ]);

  const normalizedQuery = promptQuery.trim().toLowerCase();
  const normalizedStatus = ["all", "draft", "published"].includes(promptStatus) ? promptStatus : "all";
  const filteredProfiles = profiles.filter((profile) => {
    const hasDraft = profile.versions.some((version) => !version.publishedAt);
    const matchesStatus = normalizedStatus === "all" || (normalizedStatus === "draft" ? hasDraft : Boolean(profile.activeVersion));
    const matchesQuery = !normalizedQuery || `${profile.name} ${profile.description || ""}`.toLowerCase().includes(normalizedQuery);
    return matchesStatus && matchesQuery;
  });
  const selectedProfile = profiles.find((profile) => profile.id === promptProfileId) || filteredProfiles[0] || profiles[0];

  if (!selectedProfile) {
    return (
      <section className="border border-dashed border-slate-300 bg-white p-8 text-center">
        <h2 className="text-lg font-black text-ink">还没有 Prompt 档案</h2>
        <p className="mt-2 text-sm font-semibold text-slate-500">先创建第一套专业课程 Prompt，再绑定课程并发布。</p>
        <form action={createAiExplainPromptProfile} className="mx-auto mt-5 grid max-w-xl gap-3 text-left">
          <input className="input rounded-none" name="name" placeholder="例如：土木工程 AI解释" required />
          <textarea className="input min-h-20 rounded-none" name="description" placeholder="填写适用范围和维护说明（可选）" />
          <button className="primary-button justify-center rounded-none" type="submit"><Plus size={16} />创建档案</button>
        </form>
      </section>
    );
  }

  const draft = selectedProfile.versions.find((version) => !version.publishedAt) || null;
  const activeVersion = selectedProfile.activeVersion;
  const publishedVersions = selectedProfile.versions.filter((version) => version.publishedAt);
  const selectedPublishedVersion = publishedVersions.find((version) => version.id === promptVersionId) || null;
  const editorVersion = draft?.version || (selectedProfile.versions[0]?.version || 0) + 1;
  const editorSystemPrompt = selectedPublishedVersion?.systemPrompt || draft?.systemPrompt || activeVersion?.systemPrompt || defaultAiExplainSystemPrompt;
  const editorUserPrompt = selectedPublishedVersion?.userPromptTemplate || draft?.userPromptTemplate || activeVersion?.userPromptTemplate || defaultAiExplainUserPromptTemplate;

  return (
    <section className="grid min-w-0 gap-4 xl:grid-cols-[250px_minmax(0,1fr)_340px]">
      <aside className="min-w-0 border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-black text-ink">Prompt档案</h2>
              <p className="mt-1 text-xs font-semibold text-slate-500">共 {profiles.length} 项</p>
            </div>
            <details className="group relative">
              <summary className="flex min-h-10 cursor-pointer list-none items-center gap-1 border border-violet-200 px-3 py-2 text-xs font-black text-violet-700 hover:bg-violet-50">
                <Plus size={14} />新建
              </summary>
              <form action={createAiExplainPromptProfile} className="absolute left-0 z-20 mt-2 grid w-72 gap-3 border border-slate-200 bg-white p-4 shadow-xl">
                <label className="text-xs font-black text-slate-600">档案名称</label>
                <input className="input rounded-none" name="name" placeholder="土木工程 AI解释" required />
                <label className="text-xs font-black text-slate-600">维护说明</label>
                <textarea className="input min-h-20 rounded-none" name="description" placeholder="适用课程和专业范围" />
                <button className="primary-button justify-center rounded-none" type="submit">创建档案</button>
              </form>
            </details>
          </div>

          <form className="mt-4 grid gap-2" method="get">
            <input name="tab" type="hidden" value="prompt" />
            <input className="input rounded-none" defaultValue={promptQuery} name="promptQuery" placeholder="搜索档案名称" />
            <select className="input rounded-none" defaultValue={normalizedStatus} name="promptStatus">
              <option value="all">全部状态</option>
              <option value="draft">有草稿</option>
              <option value="published">已发布</option>
            </select>
            <button className="secondary-button justify-center rounded-none" type="submit">筛选</button>
          </form>
        </div>

        <nav className="max-h-[720px] space-y-2 overflow-y-auto p-4" aria-label="Prompt档案列表">
          {filteredProfiles.length === 0 ? (
            <p className="border border-dashed border-slate-200 p-4 text-center text-xs font-semibold text-slate-500">没有符合条件的档案。</p>
          ) : filteredProfiles.map((profile) => {
            const profileDraft = profile.versions.find((version) => !version.publishedAt);
            const selected = profile.id === selectedProfile.id;
            return (
              <div className="relative" key={profile.id}>
                <Link
                  className={cn(
                    "block border p-3 transition",
                    profile.isDefault ? "pr-3" : "pr-11",
                    selected ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-blue-300 hover:bg-slate-50"
                  )}
                  href={promptHref(profile.id, promptQuery, normalizedStatus)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-black text-ink">{profile.name}</p>
                    {profile.isDefault ? <span className="shrink-0 bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-500">兜底</span> : null}
                  </div>
                  <p className={cn("mt-2 text-xs font-bold", profileDraft ? "text-violet-700" : "text-emerald-700")}>
                    {profileDraft ? `● 草稿 v${profileDraft.version}` : profile.activeVersion ? `● 已发布 v${profile.activeVersion.version}` : "● 尚未发布"}
                  </p>
                </Link>
                {!profile.isDefault ? (
                  <form action={deleteAiExplainPromptProfile} className="absolute right-2 top-2 z-10">
                    <input name="profileId" type="hidden" value={profile.id} />
                    <AdminAiPromptProfileDeleteButton profileName={profile.name} />
                  </form>
                ) : null}
              </div>
            );
          })}
        </nav>
      </aside>

      <section className="min-w-0 border border-slate-200 bg-white shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-black text-ink">
              {selectedProfile.name} · {selectedPublishedVersion ? `历史版本 v${selectedPublishedVersion.version}` : `草稿 v${editorVersion}`}
            </h2>
            {selectedProfile.description ? <p className="mt-1 text-xs font-semibold text-slate-500">{selectedProfile.description}</p> : null}
          </div>
          <span className="border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-black text-slate-600">
            {activeVersion ? `线上版本 v${activeVersion.version}` : "尚无线上版本"}
          </span>
        </header>

        <form action={saveAiExplainPromptDraft} className="p-5">
          <input name="profileId" type="hidden" value={selectedProfile.id} />
          {selectedPublishedVersion ? (
            <div className="mb-5 border border-blue-200 bg-blue-50 p-3 text-xs font-semibold leading-5 text-blue-800">
              <p className="font-black">正在编辑历史版本 v{selectedPublishedVersion.version} 的内容</p>
              <p className="mt-1">
                保存草稿后，{draft ? `草稿 v${draft.version} 将更新` : `将创建草稿 v${editorVersion}`}；历史版本 v{selectedPublishedVersion.version} 不会被覆盖。发布时选择“仅影响后续新生成内容”后，不会改动已有解释。
              </p>
            </div>
          ) : null}
          <AdminAiPromptEditor
            key={selectedPublishedVersion?.id || draft?.id || `profile-${selectedProfile.id}-v${editorVersion}`}
            initialSystemPrompt={editorSystemPrompt}
            initialUserPromptTemplate={editorUserPrompt}
          />
          <div className="mt-5 flex justify-end border-t border-slate-100 pt-4">
            <button className="secondary-button min-w-40 justify-center rounded-none border-blue-300 text-blue-700 hover:bg-blue-50" type="submit">
              <Save size={16} />保存草稿
            </button>
          </div>
        </form>
      </section>

      <aside className="min-w-0 space-y-4">
        <section className="border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-black text-ink">课程绑定</h2>
              <p className="mt-1 text-xs font-semibold text-slate-500">按区域学制和专业统一绑定 Prompt。</p>
            </div>
            <Link2 className="text-violet-600" size={18} />
          </div>

          <div className="mt-4 space-y-2">
            {selectedProfile.regionMajors.length === 0 ? (
              <p className="border border-dashed border-slate-200 p-3 text-xs font-semibold leading-5 text-slate-500">尚未绑定专业；学生端将继续使用通用兜底 Prompt。</p>
            ) : selectedProfile.regionMajors.map((regionMajor) => (
              <div key={regionMajor.id} className="flex min-h-11 items-center justify-between gap-2 border border-slate-200 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-black text-ink">{regionMajorLabel(regionMajor)}</p>
                  <p
                    className={`mt-0.5 text-[11px] font-semibold ${
                      activeVersion ? "text-emerald-700" : "text-amber-700"
                    }`}
                  >
                    ● {activeVersion ? "生效中" : "待发布"}
                  </p>
                </div>
                <form action={unbindMajorAiExplainPrompt}>
                  <input name="profileId" type="hidden" value={selectedProfile.id} />
                  <input name="regionMajorId" type="hidden" value={regionMajor.id} />
                  <button aria-label={`解除 ${regionMajorLabel(regionMajor)} 的绑定`} className="flex size-9 items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-600" type="submit">
                    <X size={16} />
                  </button>
                </form>
              </div>
            ))}
          </div>

          <AdminAiPromptMajorBindingForm
            profileId={selectedProfile.id}
            regionMajors={regionMajorOptions.map((regionMajor) => ({
              id: regionMajor.id,
              regionId: regionMajor.regionId,
              regionName: regionMajor.region.name,
              majorId: regionMajor.majorId,
              majorName: regionMajor.major.name,
              currentProfileName: regionMajor.aiExplainPromptProfile?.name || null
            }))}
          />
        </section>

        <form action={publishAiExplainPromptDraft} className="border border-slate-200 bg-white p-4 shadow-sm">
          <input name="profileId" type="hidden" value={selectedProfile.id} />
          <h2 className="text-base font-black text-ink">发布设置</h2>
          <fieldset className="mt-4 space-y-3">
            <legend className="text-xs font-black text-slate-600">发布范围</legend>
            <label className="flex cursor-pointer items-start gap-2 text-xs font-semibold leading-5 text-slate-700">
              <input className="mt-1 accent-blue-600" defaultChecked name="publishScope" type="radio" value="future" />
              <span><strong className="block text-ink">仅影响后续新生成内容（推荐）</strong>不影响历史已生成的解释内容。</span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 text-xs font-semibold leading-5 text-slate-700">
              <input className="mt-1 accent-blue-600" name="publishScope" type="radio" value="invalidate" />
              <span><strong className="block text-ink">使旧版本解释失效</strong>学生再次查看时按新版本重新生成。</span>
            </label>
          </fieldset>
          <label className="mt-4 block text-xs font-black text-slate-600">
            更改说明（必填）
            <textarea className="input mt-2 min-h-20 rounded-none font-semibold" maxLength={200} name="changeNote" placeholder="例如：强化专业术语、公式与规范依据" required />
          </label>
          <button className="primary-button mt-4 w-full justify-center rounded-none bg-emerald-600 hover:bg-emerald-700" disabled={!draft} type="submit">
            发布 v{editorVersion}
          </button>
          {!draft ? <p className="mt-2 text-center text-xs font-semibold text-amber-700">请先保存草稿，再发布新版本。</p> : null}
        </form>

        <section className="border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-black text-ink">版本记录</h2>
          <div className="mt-4 divide-y divide-slate-100 border border-slate-200">
            {publishedVersions.length === 0 ? (
              <p className="p-4 text-xs font-semibold text-slate-500">暂无已发布版本。</p>
            ) : publishedVersions.map((version) => {
              const active = version.id === activeVersion?.id;
              const selected = version.id === selectedPublishedVersion?.id;
              return (
                <div key={version.id} className={cn("flex items-start gap-2 p-3", selected ? "bg-blue-50 ring-1 ring-inset ring-blue-300" : "hover:bg-slate-50")}>
                  <Link
                    aria-current={selected ? "true" : undefined}
                    className="min-w-0 flex-1 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    href={promptHref(selectedProfile.id, promptQuery, normalizedStatus, version.id)}
                  >
                    <div>
                      <p className="text-xs font-black text-ink">
                        v{version.version}
                        {active ? <span className="ml-1 bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700">当前线上</span> : null}
                        {selected ? <span className="ml-1 bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-700">编辑中</span> : null}
                      </p>
                      <p className="mt-1 text-[11px] font-semibold text-slate-500">{formatPublishedAt(version.publishedAt)} · {version.createdByName || "管理员"}</p>
                    </div>
                    {version.changeNote ? <p className="mt-2 text-xs font-semibold leading-5 text-slate-600">{version.changeNote}</p> : null}
                  </Link>
                  <div className="flex shrink-0 items-start gap-1">
                    {!active && !draft ? (
                      <form action={rollbackAiExplainPromptVersion}>
                        <input name="profileId" type="hidden" value={selectedProfile.id} />
                        <input name="versionId" type="hidden" value={version.id} />
                        <button className="flex min-h-9 items-center gap-1 px-2 text-[11px] font-black text-blue-700 hover:bg-blue-50" type="submit"><RotateCcw size={13} />回滚</button>
                      </form>
                    ) : !active && draft ? (
                      <span className="pt-2 text-[10px] font-bold text-slate-400">先处理草稿</span>
                    ) : null}
                    {selectedProfile.isDefault ? (
                      <span className="mt-2 bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-500">默认保护</span>
                    ) : (
                      <form action={deleteAiExplainPromptVersion}>
                        <input name="profileId" type="hidden" value={selectedProfile.id} />
                        <input name="versionId" type="hidden" value={version.id} />
                        <AdminAiPromptVersionDeleteButton
                          isActive={active}
                          profileName={selectedProfile.name}
                          version={version.version}
                        />
                      </form>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {draft ? (
          <form action={discardAiExplainPromptDraft}>
            <input name="profileId" type="hidden" value={selectedProfile.id} />
            <button className="secondary-button w-full justify-center rounded-none border-red-100 text-red-600 hover:bg-red-50" type="submit">
              <Trash2 size={15} />放弃草稿
            </button>
          </form>
        ) : null}
      </aside>
    </section>
  );
}
