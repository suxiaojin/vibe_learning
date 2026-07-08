import Link from "next/link";
import { ArrowLeft, BookOpen, Globe2, Lock, Trash2 } from "lucide-react";
import { notFound } from "next/navigation";
import {
  deleteAiStudyProjectAsAdmin,
  privatizeAiStudyProject,
  publishAiStudyProject
} from "@/app/admin/ai-study-projects/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { requireAdmin } from "@/lib/auth";
import {
  getAdminAiStudyProject,
  getAiStudyProjectSourceDirectories,
  getAiStudySourceDirectory
} from "@/lib/admin-ai-study-projects";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  params: Promise<{ projectId: string }>;
  searchParams?: Promise<{ notice?: string; error?: string }>;
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

const sourceStatusLabels: Record<string, string> = {
  uploaded: "已上传",
  parsed: "已解析",
  failed: "解析失败"
};

const taskStatusLabels: Record<string, string> = {
  pending: "等待中",
  running: "执行中",
  succeeded: "成功",
  failed: "失败",
  canceled: "已取消"
};

const noticeText: Record<string, string> = {
  published: "项目已转为公开。",
  privatized: "项目已转为私有。",
  deleted: "项目数据库记录已删除，MinIO 源文件已保留。"
};

const errorText: Record<string, string> = {
  "project-unavailable": "项目不存在或已删除，操作未完成。",
  "publish-requires-ready": "只有已就绪且未删除的项目才能转为公开。"
};

export default async function AdminAiStudyProjectDetailPage({ params, searchParams }: PageProps) {
  await requireAdmin();
  const { projectId } = await params;
  const query = await searchParams;
  const project = await getAdminAiStudyProject(projectId);
  if (!project) {
    notFound();
  }

  const currentPath = `/admin/ai-study-projects/${project.id}`;
  const directories = getAiStudyProjectSourceDirectories(project.sources);
  const ownerName = project.owner.studentProfile?.nickname || project.owner.username;
  const canPublish = project.status === "ready" && !project.deletedAt && project.visibility !== "public";
  const canPrivatize = !project.deletedAt && project.visibility !== "private";
  const canDelete = !project.deletedAt;
  const publishFormId = `publish-detail-${project.id}`;
  const privatizeFormId = `privatize-detail-${project.id}`;
  const deleteFormId = `delete-detail-${project.id}`;
  const notice = query?.notice ? noticeText[query.notice] : "";
  const error = query?.error ? errorText[query.error] : "";

  return (
    <main className="grid gap-6">
      <section className="panel">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <Link className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-teal" href="/admin/ai-study-projects">
              <ArrowLeft size={16} />
              返回项目管理
            </Link>
            <h1 className="break-words text-2xl font-black text-ink">{project.title}</h1>
            <p className="mt-2 text-sm text-slate-500">项目 ID：{project.id}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className="secondary-button inline-flex items-center gap-2" href={`/admin/ai-study-projects/${project.id}/preview`}>
              <BookOpen size={16} />
              预览学习内容
            </Link>
            <form id={publishFormId} action={publishAiStudyProject}>
              <input type="hidden" name="projectId" value={project.id} />
              <input type="hidden" name="returnTo" value={currentPath} />
            </form>
            <button className="secondary-button inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50" disabled={!canPublish} form={publishFormId} type="submit">
              <Globe2 size={16} />
              转为公开
            </button>
            <form id={privatizeFormId} action={privatizeAiStudyProject}>
              <input type="hidden" name="projectId" value={project.id} />
              <input type="hidden" name="returnTo" value={currentPath} />
            </form>
            <ConfirmSubmitButton
              className="secondary-button inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!canPrivatize}
              form={privatizeFormId}
              message="确认将这个项目转为私有？项目不会被删除，创建者仍可在自己的项目中看到。"
            >
              <Lock size={16} />
              转私有
            </ConfirmSubmitButton>
            <form id={deleteFormId} action={deleteAiStudyProjectAsAdmin}>
              <input type="hidden" name="projectId" value={project.id} />
              <input type="hidden" name="returnTo" value={currentPath} />
            </form>
            <ConfirmSubmitButton
              className="secondary-button inline-flex items-center gap-2 text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!canDelete}
              form={deleteFormId}
              message="确认删除这个项目的数据库记录？项目、资料元信息、知识框架、知识卡片和进度记录会从 PostgreSQL 删除，MinIO 源文件保留。"
            >
              <Trash2 size={16} />
              删除
            </ConfirmSubmitButton>
          </div>
        </div>

        {notice ? <div className="mt-4 rounded-2xl bg-teal/10 p-3 text-sm font-semibold text-teal">{notice}</div> : null}
        {error ? <div className="mt-4 rounded-2xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div> : null}

        <div className="mt-6 grid gap-4 lg:grid-cols-4">
          <InfoTile label="生成状态" value={<ProjectStatusBadge status={project.status} />} />
          <InfoTile label="公开状态" value={<VisibilityBadge visibility={project.visibility} />} />
          <InfoTile label="资料 / 片段" value={`${project._count.sources} / ${project._count.sourceChunks}`} />
          <InfoTile label="节点 / 卡片" value={`${project._count.nodes} / ${project._count.cards}`} />
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <div className="panel">
          <h2 className="text-lg font-black">创建者</h2>
          <div className="mt-4 space-y-3 text-sm">
            <InfoRow label="学生" value={<Link className="font-semibold text-ink hover:text-teal hover:underline" href={`/admin/students/${project.owner.id}`}>{ownerName}</Link>} />
            <InfoRow label="用户名" value={project.owner.username} />
            <InfoRow label="账号状态" value={project.owner.status} />
            <InfoRow label="省份/学制" value={formatOwnerRegion(project.owner.studentProfile)} />
            <InfoRow label="专业" value={project.owner.studentProfile?.major?.name || "暂无"} />
          </div>
        </div>

        <div className="panel">
          <h2 className="text-lg font-black">项目基础信息</h2>
          <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
            <InfoRow label="来源类型" value={project.sourceType} />
            <InfoRow label="学习目标" value={project.learningGoal} />
            <InfoRow label="已掌握" value={`${project.masteredCount} / ${project.knowledgeCount}`} />
            <InfoRow label="学习人数记录" value={`${project._count.progress}`} />
            <InfoRow label="创建时间" value={formatDate(project.createdAt)} />
            <InfoRow label="最后学习" value={formatDate(project.lastStudiedAt)} />
            <InfoRow label="删除时间" value={formatDate(project.deletedAt)} />
          </div>
          {project.description ? <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">{project.description}</p> : null}
        </div>
      </section>

      <section className="panel">
        <h2 className="text-lg font-black">MinIO 目录前缀</h2>
        {directories.length > 0 ? (
          <div className="mt-4 grid gap-2">
            {directories.map((directory) => (
              <code key={directory} className="break-all rounded bg-slate-100 px-3 py-2 text-xs text-slate-700">
                {directory}
              </code>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">暂无 MinIO 文件目录。文本项目可能没有对象存储路径。</p>
        )}
      </section>

      <section className="panel">
        <h2 className="text-lg font-black">上传资料</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[1120px] border-separate border-spacing-0 text-left text-sm">
            <thead>
              <tr className="text-slate-500">
                <th className="border-b border-slate-200 py-3 pr-4 font-semibold">文件</th>
                <th className="border-b border-slate-200 py-3 pr-4 font-semibold">状态</th>
                <th className="border-b border-slate-200 py-3 pr-4 font-semibold">大小/页数</th>
                <th className="border-b border-slate-200 py-3 pr-4 font-semibold">Bucket</th>
                <th className="border-b border-slate-200 py-3 pr-4 font-semibold">Storage Key</th>
                <th className="border-b border-slate-200 py-3 pr-4 font-semibold">Storage Path</th>
                <th className="border-b border-slate-200 py-3 font-semibold">目录前缀</th>
              </tr>
            </thead>
            <tbody>
              {project.sources.length === 0 ? (
                <tr>
                  <td className="py-8 text-center text-slate-500" colSpan={7}>暂无上传资料。</td>
                </tr>
              ) : project.sources.map((source) => {
                const directory = getAiStudySourceDirectory(source);
                return (
                  <tr key={source.id} className="align-top text-slate-700">
                    <td className="border-b border-slate-100 py-4 pr-4">
                      <div className="font-semibold text-ink">{source.fileName || "文本来源"}</div>
                      <div className="mt-1 text-xs text-slate-400">{source.mimeType || source.sourceType}</div>
                      <div className="mt-1 text-xs text-slate-400">上传 {formatDate(source.createdAt)}</div>
                    </td>
                    <td className="border-b border-slate-100 py-4 pr-4">{sourceStatusLabels[source.status] || source.status}</td>
                    <td className="border-b border-slate-100 py-4 pr-4">
                      <div>{formatBytes(source.fileSizeBytes)}</div>
                      <div className="mt-1 text-xs text-slate-400">{source.pageCount ? `${source.pageCount} 页` : "页数暂无"}</div>
                    </td>
                    <td className="border-b border-slate-100 py-4 pr-4">
                      <code className="break-all rounded bg-slate-100 px-2 py-1 text-xs">{source.storageBucket || "无"}</code>
                    </td>
                    <td className="max-w-[280px] border-b border-slate-100 py-4 pr-4">
                      <code className="block break-all rounded bg-slate-100 px-2 py-1 text-xs">{source.storageKey || "无"}</code>
                    </td>
                    <td className="max-w-[280px] border-b border-slate-100 py-4 pr-4">
                      <code className="block break-all rounded bg-slate-100 px-2 py-1 text-xs">{source.storagePath || "无"}</code>
                    </td>
                    <td className="max-w-[280px] border-b border-slate-100 py-4">
                      <code className="block break-all rounded bg-slate-100 px-2 py-1 text-xs">{directory || "无"}</code>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2 className="text-lg font-black">生成任务</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[980px] border-separate border-spacing-0 text-left text-sm">
            <thead>
              <tr className="text-slate-500">
                <th className="border-b border-slate-200 py-3 pr-4 font-semibold">任务</th>
                <th className="border-b border-slate-200 py-3 pr-4 font-semibold">状态</th>
                <th className="border-b border-slate-200 py-3 pr-4 font-semibold">阶段</th>
                <th className="border-b border-slate-200 py-3 pr-4 font-semibold">重试</th>
                <th className="border-b border-slate-200 py-3 pr-4 font-semibold">时间</th>
                <th className="border-b border-slate-200 py-3 font-semibold">错误</th>
              </tr>
            </thead>
            <tbody>
              {project.tasks.length === 0 ? (
                <tr>
                  <td className="py-8 text-center text-slate-500" colSpan={6}>暂无生成任务。</td>
                </tr>
              ) : project.tasks.map((task) => (
                <tr key={task.id} className="align-top text-slate-700">
                  <td className="border-b border-slate-100 py-4 pr-4">
                    <div className="font-semibold text-ink">{task.type}</div>
                    <div className="mt-1 text-xs text-slate-400">{task.id}</div>
                  </td>
                  <td className="border-b border-slate-100 py-4 pr-4">{taskStatusLabels[task.status] || task.status}</td>
                  <td className="max-w-[220px] border-b border-slate-100 py-4 pr-4">
                    <span className="break-all">{task.stage || "暂无"}</span>
                  </td>
                  <td className="border-b border-slate-100 py-4 pr-4">{task.retryCount}</td>
                  <td className="border-b border-slate-100 py-4 pr-4 leading-6">
                    <div>创建 {formatDate(task.createdAt)}</div>
                    <div>开始 {formatDate(task.startedAt)}</div>
                    <div>结束 {formatDate(task.finishedAt)}</div>
                  </td>
                  <td className="max-w-[320px] border-b border-slate-100 py-4">
                    {task.errorMessage ? <span className="break-all text-red-700">{task.errorMessage}</span> : <span className="text-slate-400">无</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function InfoTile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-2 text-lg font-black text-ink">{value}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-1 break-words text-slate-800">{value}</div>
    </div>
  );
}

function ProjectStatusBadge({ status }: { status: string }) {
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

function formatOwnerRegion(profile: { region: { province: string; studySystem: string } | null } | null) {
  if (!profile?.region) {
    return "暂无";
  }
  return `${profile.region.province} / ${profile.region.studySystem}`;
}

function formatDate(value: Date | string | null) {
  if (!value) {
    return "暂无";
  }
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleString("zh-CN", {
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatBytes(value: number | null) {
  if (!value) {
    return "暂无";
  }
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
