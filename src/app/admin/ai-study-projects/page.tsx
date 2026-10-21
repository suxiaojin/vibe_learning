import Link from "next/link";
import { Globe2, Lock, Search, Trash2 } from "lucide-react";
import {
  deleteAiStudyProjectAsAdmin,
  privatizeAiStudyProject,
  publishAiStudyProject
} from "@/app/admin/ai-study-projects/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { OfficialStudyMaterialPanel } from "@/components/admin/official-study-material-panel";
import { ProjectDiamondPriceSetting } from "@/components/admin/project-diamond-price-setting";
import { ProjectPurchaseUsers } from "@/components/admin/project-purchase-users";
import { AiStudyProjectGroupRows } from "@/components/admin/ai-study-project-group-rows";
import { requireAdmin } from "@/lib/auth";
import {
  buildAdminAiStudyProjectsPath,
  listAdminAiStudyProjects
} from "@/lib/admin-ai-study-projects";
import {
  listAdminOfficialStudyMaterials,
  listOfficialStudyMaterialScopes
} from "@/lib/official-study-materials";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = {
  tab?: string;
  keyword?: string;
  status?: string;
  visibility?: string;
  notice?: string;
  error?: string;
};

const projectStatusLabels: Record<string, string> = {
  draft: "待开始",
  processing: "生成中",
  ready: "已就绪",
  failed: "生成失败",
  archived: "已归档"
};

const visibilityLabels: Record<string, string> = {
  private: "私有",
  public_pending: "待审核",
  public: "公开",
  rejected: "审核未通过"
};

const noticeText: Record<string, string> = {
  published: "项目已转为公开。",
  privatized: "项目已转为私有。",
  deleted: "项目数据库记录已删除，MinIO 源文件已保留。"
};

const errorText: Record<string, string> = {
  "project-unavailable": "项目不存在或已删除，操作未完成。",
  "publish-requires-ready": "所有部分的知识目录生成完成后才能转为公开。",
  "group-managed": "分部项目请在合并后的项目行统一管理。"
};

export default async function AdminAiStudyProjectsPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const activeTab = params?.tab === "official" ? "official" : "ai";
  const aiData = activeTab === "ai"
    ? await listAdminAiStudyProjects({
      keyword: params?.keyword,
      status: params?.status,
      visibility: params?.visibility
    })
    : null;
  const [officialMaterials, materialScopes] = activeTab === "official"
    ? await Promise.all([listAdminOfficialStudyMaterials(), listOfficialStudyMaterialScopes()])
    : [[], []];
  const filters = aiData?.filters || { keyword: "", status: "", visibility: "" };
  const groups = aiData?.groups || [];
  const stats = aiData?.stats || { filteredCount: 0, activeCount: 0, publicCount: 0, pendingCount: 0 };
  const currentPath = buildAdminAiStudyProjectsPath(filters);
  const notice = params?.notice ? noticeText[params.notice] : "";
  const error = params?.error ? errorText[params.error] : "";

  return (
    <main className="panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">项目管理</h1>
          <p className="mt-1 text-sm text-slate-600">查看学习搭子项目，并管理公开展示状态。</p>
        </div>
        {activeTab === "ai" ? <div className="flex flex-wrap gap-2 text-sm">
          <span className="badge bg-slate-100 text-slate-600">当前筛选 {stats.filteredCount}</span>
          <span className="badge bg-teal/10 text-teal">有效 {stats.activeCount}</span>
          <span className="badge bg-blue-50 text-blue-700">公开 {stats.publicCount}</span>
          <span className="badge bg-amber-50 text-amber-700">待审核 {stats.pendingCount}</span>
        </div> : null}
      </div>

      {notice ? <div className="mt-4 rounded-2xl bg-teal/10 p-3 text-sm font-semibold text-teal">{notice}</div> : null}
      {error ? <div className="mt-4 rounded-2xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div> : null}

      <nav className="mt-6 flex border-b border-slate-200" aria-label="项目类型">
        <Link
          className={`relative px-6 py-3 text-sm font-bold transition ${activeTab === "ai" ? "text-teal" : "text-slate-500 hover:text-ink"}`}
          href="/admin/ai-study-projects"
        >
          AI项目
          {activeTab === "ai" ? <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-teal" /> : null}
        </Link>
        <Link
          className={`relative px-6 py-3 text-sm font-bold transition ${activeTab === "official" ? "text-teal" : "text-slate-500 hover:text-ink"}`}
          href="/admin/ai-study-projects?tab=official"
        >
          官方项目
          {activeTab === "official" ? <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-teal" /> : null}
        </Link>
      </nav>

      {activeTab === "official" ? (
        <OfficialStudyMaterialPanel initialMaterials={officialMaterials} scopes={materialScopes} purchaseCounts={Object.fromEntries(officialMaterials.map((material) => [material.id, material._count.purchases]))} />
      ) : <>
      <form className="mt-5 grid gap-3 rounded-2xl bg-slate-50 p-4 xl:grid-cols-[minmax(260px,1fr)_150px_150px_auto]" action="/admin/ai-study-projects">
        <div>
          <label className="label">搜索项目</label>
          <input className="input" name="keyword" defaultValue={filters.keyword} placeholder="项目名、学生、文件名或 MinIO key" />
        </div>
        <div>
          <label className="label">生成状态</label>
          <select className="input" name="status" defaultValue={filters.status}>
            <option value="">全部状态</option>
            {Object.entries(projectStatusLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">公开状态</label>
          <select className="input" name="visibility" defaultValue={filters.visibility}>
            <option value="">全部可见性</option>
            {Object.entries(visibilityLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end gap-2">
          <button className="primary-button inline-flex items-center gap-2" type="submit">
            <Search size={16} />
            筛选
          </button>
          <Link className="secondary-button" href="/admin/ai-study-projects">清空</Link>
        </div>
      </form>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[1040px] border-separate border-spacing-0 text-left text-sm">
          <thead>
            <tr className="text-slate-500">
              <th className="border-b border-slate-200 py-3 pr-4 font-semibold">项目</th>
              <th className="border-b border-slate-200 py-3 pr-4 font-semibold">创建学生</th>
              <th className="border-b border-slate-200 py-3 pr-4 font-semibold">生成状态</th>
              <th className="border-b border-slate-200 py-3 pr-4 font-semibold">公开状态</th>
              <th className="border-b border-slate-200 py-3 pr-4 font-semibold">购买用户</th>
              <th className="border-b border-slate-200 py-3 pr-4 font-semibold">创建时间</th>
              <th className="border-b border-slate-200 py-3 font-semibold">操作</th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 ? (
              <tr>
                <td className="py-8 text-center text-slate-500" colSpan={7}>没有找到符合条件的学习搭子项目。</td>
              </tr>
            ) : groups.map((group) => {
              if (group.isPartGroup) {
                const firstPart = group.parts[0];
                const ownerName = firstPart.owner.studentProfile?.nickname || firstPart.owner.username;
                const visibility = group.parts.every((part) => part.visibility === firstPart.visibility)
                  ? visibilityLabels[firstPart.visibility] || firstPart.visibility
                  : "各部分不同";
                return <AiStudyProjectGroupRows
                  key={group.id}
                  title={group.title}
                  ownerId={firstPart.owner.id}
                  ownerName={ownerName}
                  ownerUsername={firstPart.owner.username}
                  expectedPartCount={group.expectedPartCount}
                  availablePartCount={group.parts.length}
                  learningReadyCount={group.parts.filter((part) => !part.deletedAt && (part.status === "ready" || Boolean(part.learningReadyAt && part.tasks.length > 0))).length}
                  failedCount={group.parts.filter((part) => !part.deletedAt && part.status === "failed" && !(part.learningReadyAt && part.tasks.length > 0)).length}
                  visibility={visibility}
                  purchaseCount={group.parts.reduce((total, part) => total + part._count.purchases, 0)}
                  createdAt={formatDate(group.createdAt)}
                  actions={renderGroupActions(group, currentPath)}
                >
                  {group.parts.map((part) => renderProjectRow(part, currentPath, true))}
                </AiStudyProjectGroupRows>;
              }
              return renderProjectRow(group.parts[0], currentPath);
            })}
          </tbody>
        </table>
      </div>
      </>}
    </main>
  );
}

function renderProjectRow(project: Awaited<ReturnType<typeof listAdminAiStudyProjects>>["groups"][number]["parts"][number], currentPath: string, nested = false) {
              const ownerName = project.owner.studentProfile?.nickname || project.owner.username;
              const canPublish = project.status === "ready" && !project.deletedAt && project.visibility !== "public";
              const canPrivatize = !project.deletedAt && project.visibility !== "private";
              const publishFormId = `publish-${project.id}`;
              const privatizeFormId = `privatize-${project.id}`;
              const deleteFormId = `delete-${project.id}`;

              return (
                <tr key={project.id} className={`align-top text-slate-700 ${nested ? "bg-blue-50/30" : ""}`}>
                  <td className="border-b border-slate-100 py-4 pr-4">
                    {nested ? <div className="mb-1 text-xs font-semibold text-slate-500">第 {project.partIndex ?? 1} 部分</div> : null}
                    <Link className="font-semibold text-ink hover:text-teal hover:underline" href={`/admin/ai-study-projects/${project.id}`}>
                      {project.title}
                    </Link>
                    <div className="mt-1 text-xs text-slate-400">{project.id}</div>
                    {project.deletedAt ? <div className="mt-2 text-xs font-semibold text-red-600">学生删除于 {formatDate(project.deletedAt)}</div> : null}
                  </td>
                  <td className="border-b border-slate-100 py-4 pr-4">
                    <Link className="font-semibold text-ink hover:text-teal hover:underline" href={`/admin/students/${project.owner.id}`}>
                      {ownerName}
                    </Link>
                    <div className="mt-1 text-xs text-slate-400">{project.owner.username}</div>
                  </td>
                  <td className="border-b border-slate-100 py-4 pr-4">
                    <ProjectStatusBadge deleted={Boolean(project.deletedAt)} learningAvailable={Boolean(project.learningReadyAt)} status={project.status} />
                  </td>
                  <td className="border-b border-slate-100 py-4 pr-4">
                    <VisibilityBadge visibility={project.visibility} />
                  </td>
                  <td className="border-b border-slate-100 py-4 pr-4">
                    <ProjectPurchaseUsers kind="ai" projectId={project.id} title={project.title} purchaseCount={project._count.purchases} />
                  </td>
                  <td className="border-b border-slate-100 py-4 pr-4">
                    {formatDate(project.createdAt)}
                  </td>
                  <td className="border-b border-slate-100 py-4">
                    {nested ? <Link className="text-sm font-semibold text-teal hover:underline" href={`/admin/ai-study-projects/${project.id}`}>查看部分详情</Link> :
                    <div className="flex min-w-[250px] flex-wrap gap-2">
                      <ProjectDiamondPriceSetting kind="ai" projectId={project.id} title={project.title} diamondPrice={project.diamondPrice} disabled={Boolean(project.deletedAt)} />
                      <form id={publishFormId} action={publishAiStudyProject}>
                        <input type="hidden" name="projectId" value={project.id} />
                        <input type="hidden" name="returnTo" value={currentPath} />
                      </form>
                      <button className="secondary-button inline-flex items-center gap-1 px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50" disabled={!canPublish} form={publishFormId} type="submit">
                        <Globe2 size={14} />
                        转公开
                      </button>
                      <form id={privatizeFormId} action={privatizeAiStudyProject}>
                        <input type="hidden" name="projectId" value={project.id} />
                        <input type="hidden" name="returnTo" value={currentPath} />
                      </form>
                      <ConfirmSubmitButton
                        className="secondary-button inline-flex items-center gap-1 px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={!canPrivatize}
                        form={privatizeFormId}
                        message="确认将这个项目转为私有？项目不会被删除，创建者仍可在自己的项目中看到。"
                      >
                        <Lock size={14} />
                        转私有
                      </ConfirmSubmitButton>
                      <form id={deleteFormId} action={deleteAiStudyProjectAsAdmin}>
                        <input type="hidden" name="projectId" value={project.id} />
                        <input type="hidden" name="returnTo" value={currentPath} />
                      </form>
                      <ConfirmSubmitButton
                        className="secondary-button inline-flex items-center gap-1 px-3 py-2 text-xs text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                        form={deleteFormId}
                        message="确认删除这个项目的数据库记录？项目、资料元信息、知识框架、知识卡片和进度记录会从 PostgreSQL 删除，MinIO 源文件保留。"
                      >
                        <Trash2 size={14} />
                        删除
                      </ConfirmSubmitButton>
                    </div>}
                  </td>
                </tr>
              );
}

function renderGroupActions(group: Awaited<ReturnType<typeof listAdminAiStudyProjects>>["groups"][number], currentPath: string) {
  const activeParts = group.parts.filter((part) => !part.deletedAt);
  const isUnified = activeParts.some((part) => Boolean(part.canonicalProjectId));
  const canPublish = activeParts.length === group.expectedPartCount && activeParts.every((part) => isUnified
    ? Boolean(part.learningReadyAt) && part.tasks.length > 0
    : part.status === "ready")
    && activeParts.some((part) => part.visibility !== "public");
  const canPrivatize = activeParts.some((part) => part.visibility !== "private");
  const price = activeParts[0]?.diamondPrice ?? 0;
  const priceMixed = activeParts.some((part) => part.diamondPrice !== price);
  const publishFormId = `publish-group-${group.id}`;
  const privatizeFormId = `privatize-group-${group.id}`;
  const deleteFormId = `delete-group-${group.id}`;
  return <div className="flex min-w-[250px] flex-wrap gap-2">
    <ProjectDiamondPriceSetting kind="ai_group" projectId={group.id} title={group.title} diamondPrice={price} mixed={priceMixed} disabled={activeParts.length === 0} />
    <form id={publishFormId} action={publishAiStudyProject}>
      <input type="hidden" name="groupId" value={group.id} />
      <input type="hidden" name="returnTo" value={currentPath} />
    </form>
    <button className="secondary-button inline-flex items-center gap-1 px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50" disabled={!canPublish} form={publishFormId} type="submit">
      <Globe2 size={14} />转公开
    </button>
    <form id={privatizeFormId} action={privatizeAiStudyProject}>
      <input type="hidden" name="groupId" value={group.id} />
      <input type="hidden" name="returnTo" value={currentPath} />
    </form>
    <ConfirmSubmitButton className="secondary-button inline-flex items-center gap-1 px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50" disabled={!canPrivatize} form={privatizeFormId} message="确认将这个项目的所有部分转为私有？创建者仍可在自己的项目中看到。">
      <Lock size={14} />转私有
    </ConfirmSubmitButton>
    <form id={deleteFormId} action={deleteAiStudyProjectAsAdmin}>
      <input type="hidden" name="groupId" value={group.id} />
      <input type="hidden" name="returnTo" value={currentPath} />
    </form>
    <ConfirmSubmitButton className="secondary-button inline-flex items-center gap-1 px-3 py-2 text-xs text-red-700" form={deleteFormId} message={`确认删除“${group.title}”的全部 ${group.parts.length} 个部分及其数据库记录？知识框架、卡片和进度也会删除；MinIO 源文件保留。`}>
      <Trash2 size={14} />删除
    </ConfirmSubmitButton>
  </div>;
}

function ProjectStatusBadge({ deleted = false, learningAvailable = false, status }: { deleted?: boolean; learningAvailable?: boolean; status: string }) {
  if (deleted) {
    return <span className="badge bg-red-50 text-red-700">学生已删除</span>;
  }
  if (learningAvailable && status !== "ready") {
    return <span className="badge bg-teal/10 text-teal">可学习 · 详解按需生成</span>;
  }
  const className = status === "ready"
    ? "bg-teal/10 text-teal"
    : status === "processing"
      ? "bg-amber-50 text-amber-700"
      : status === "failed"
        ? "bg-red-50 text-red-700"
        : status === "archived"
          ? "bg-slate-100 text-slate-500"
          : "bg-blue-50 text-blue-700";
  return <span className={`badge ${className}`}>{projectStatusLabels[status] || status}</span>;
}

function VisibilityBadge({ visibility }: { visibility: string }) {
  const className = visibility === "public"
    ? "bg-blue-50 text-blue-700"
    : visibility === "public_pending"
      ? "bg-amber-50 text-amber-700"
      : visibility === "rejected"
        ? "bg-slate-100 text-slate-500"
        : "bg-slate-50 text-slate-600";
  return <span className={`badge ${className}`}>{visibilityLabels[visibility] || visibility}</span>;
}

function formatDate(value: Date | string | null) {
  if (!value) {
    return "暂无";
  }
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleString("zh-CN", {
    hour12: false,
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}
