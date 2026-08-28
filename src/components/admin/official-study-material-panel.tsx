"use client";

import { type ChangeEvent, useRef, useState } from "react";
import Link from "next/link";
import { FileText, Globe2, Lock, Pencil, Trash2, Upload, X } from "lucide-react";
import { ProjectDiamondPriceSetting } from "@/components/admin/project-diamond-price-setting";
import { ProjectPurchaseUsers } from "@/components/admin/project-purchase-users";

type ScopeOption = { id: string; name: string; type: "major" | "public_subject" };
type ScopeReference = { id: string; name: string };

export type AdminOfficialStudyMaterial = {
  id: string;
  diamondPrice: number;
  title: string;
  description: string | null;
  fileType: "pdf" | "word";
  originalFileName: string;
  mimeType: string;
  fileSizeBytes: number;
  fileStatus: "uploading" | "ready" | "failed";
  processingError: string | null;
  visibility: "draft" | "public" | "offline";
  sortOrder: number;
  publishedAt: Date | string | null;
  createdAt: Date | string;
  courseId: string | null;
  majorId: string | null;
  publicSubjectId: string | null;
  course: ScopeReference | null;
  major: ScopeReference | null;
  publicSubject: ScopeReference | null;
  createdBy: { id: string; username: string };
};

type EditDraft = {
  id: string;
  title: string;
  description: string;
  scopeValue: string;
  sortOrder: string;
};

type UploadResult = { name: string; state: "uploading" | "done" | "failed"; message?: string };

const maxFileBytes = 80 * 1024 * 1024;

export function OfficialStudyMaterialPanel({
  initialMaterials,
  scopes,
  purchaseCounts
}: {
  initialMaterials: AdminOfficialStudyMaterial[];
  scopes: ScopeOption[];
  purchaseCounts: Record<string, number>;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [materials, setMaterials] = useState(initialMaterials);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([]);
  const [editing, setEditing] = useState<EditDraft | null>(null);
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function selectFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    const invalid = files.find((file) => !isSupportedFile(file));
    if (invalid) {
      setError(`${invalid.name} 不是 PDF 文件。`);
      return;
    }
    const oversized = files.find((file) => file.size > maxFileBytes);
    if (oversized) {
      setError(`${oversized.name} 超过 80MB。`);
      return;
    }
    setError("");
    setUploadResults([]);
    const acceptedFiles = files.slice(0, 30);
    if (files.length > acceptedFiles.length) {
      setMessage("单次最多上传 30 份资料，已保留前 30 份。");
    }
    void uploadFiles(acceptedFiles);
  }

  async function uploadFiles(files: File[]) {
    if (files.length === 0 || isUploading) {
      return;
    }
    setIsUploading(true);
    setError("");
    setMessage("");
    const results: UploadResult[] = files.map((file) => ({ name: file.name, state: "uploading" }));
    setUploadResults(results);
    let successCount = 0;

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      try {
        const formData = new FormData();
        formData.set("file", file);
        const payload = await sendRequest<{ material: AdminOfficialStudyMaterial }>(
          "/api/admin/study-materials",
          { method: "POST", body: formData }
        );
        successCount += 1;
        setMaterials((current) => [payload.material, ...current]);
        results[index] = { name: file.name, state: "done" };
      } catch (caught) {
        results[index] = {
          name: file.name,
          state: "failed",
          message: caught instanceof Error ? caught.message : "上传失败"
        };
      }
      setUploadResults([...results]);
    }

    setIsUploading(false);
    if (successCount === files.length) {
      setMessage(`已上传 ${successCount} 份资料，当前为草稿，请预览后发布。`);
    } else {
      setError(`成功 ${successCount} 份，失败 ${files.length - successCount} 份。`);
    }
  }

  function openEdit(material: AdminOfficialStudyMaterial) {
    setEditing({
      id: material.id,
      title: material.title,
      description: material.description || "",
      scopeValue: material.majorId
        ? `major:${material.majorId}`
        : material.publicSubjectId
          ? `public_subject:${material.publicSubjectId}`
          : "",
      sortOrder: String(material.sortOrder)
    });
    setError("");
  }

  async function saveEdit() {
    if (!editing || !editing.title.trim() || busyId) {
      return;
    }
    const [scopeType, scopeId] = editing.scopeValue ? editing.scopeValue.split(":", 2) : [null, null];
    const saved = await mutateMaterial(editing.id, {
      action: "update",
      title: editing.title.trim(),
      description: editing.description.trim(),
      scopeType,
      scopeId,
      sortOrder: Number(editing.sortOrder || 0)
    });
    if (saved) {
      setEditing(null);
      setMessage("资料信息已保存。");
    }
  }

  async function changeVisibility(material: AdminOfficialStudyMaterial, action: "publish" | "unpublish") {
    if (action === "unpublish" && !window.confirm("确认下架这份资料？学生将立即无法继续查看。")) {
      return;
    }
    const saved = await mutateMaterial(material.id, { action });
    if (saved) {
      setMessage(action === "publish" ? "资料已发布到学生端公开项目。" : "资料已下架，原文件仍保留在 MinIO。");
    }
  }

  async function removeMaterial(material: AdminOfficialStudyMaterial) {
    if (!window.confirm("确认删除这份官方资料？数据库记录和 MinIO 原文件都会永久删除，无法恢复。")) {
      return;
    }
    setBusyId(material.id);
    setError("");
    try {
      await sendRequest(`/api/admin/study-materials/${material.id}`, { method: "DELETE" });
      setMaterials((current) => current.filter((item) => item.id !== material.id));
      setMessage("资料及 MinIO 原文件已删除。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "删除失败，请稍后重试。");
    } finally {
      setBusyId("");
    }
  }

  async function mutateMaterial(materialId: string, body: Record<string, unknown>) {
    setBusyId(materialId);
    setError("");
    try {
      const payload = await sendRequest<{ material: AdminOfficialStudyMaterial }>(
        `/api/admin/study-materials/${materialId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        }
      );
      setMaterials((current) => current.map((item) => item.id === materialId ? payload.material : item));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "操作失败，请稍后重试。");
      return false;
    } finally {
      setBusyId("");
    }
    return true;
  }

  return (
    <section className="mt-6 rounded-2xl border border-emerald-100 bg-[linear-gradient(135deg,#f7fff8_0%,#ffffff_58%,#f6fbff_100%)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-ink">官方资料</h2>
          <p className="mt-1 text-sm text-slate-600">选择 PDF 后立即上传为草稿，不进入 AI 解析和知识卡片生成流程。</p>
        </div>
        <button className="primary-button inline-flex items-center gap-2" disabled={isUploading} onClick={() => fileInputRef.current?.click()} type="button">
          <Upload size={16} />
          {isUploading ? "上传中..." : "选择资料"}
        </button>
        <input ref={fileInputRef} className="hidden" type="file" multiple accept=".pdf,application/pdf" onChange={selectFiles} />
      </div>

      {uploadResults.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {uploadResults.map((result) => (
            <span key={result.name} className={`rounded-full px-3 py-1 font-semibold ${result.state === "done" ? "bg-emerald-50 text-emerald-700" : result.state === "failed" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`} title={result.message || ""}>
              {result.name} · {result.state === "done" ? "完成" : result.state === "failed" ? result.message || "失败" : "处理中"}
            </span>
          ))}
        </div>
      ) : null}
      {message ? <div className="mt-3 rounded-xl bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">{message}</div> : null}
      {error ? <div className="mt-3 rounded-xl bg-red-50 px-4 py-2 text-sm font-semibold text-red-700">{error}</div> : null}

      <div className="mt-5 overflow-x-auto rounded-xl border border-slate-100 bg-white">
        <table className="w-full min-w-[1020px] text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">资料</th>
              <th className="px-4 py-3 font-semibold">课程</th>
              <th className="px-4 py-3 font-semibold">文件状态</th>
              <th className="px-4 py-3 font-semibold">发布状态</th>
              <th className="px-4 py-3 font-semibold">上传时间</th>
              <th className="px-4 py-3 font-semibold">购买用户</th>
              <th className="px-4 py-3 font-semibold">操作</th>
            </tr>
          </thead>
          <tbody>
            {materials.length === 0 ? (
              <tr><td className="px-4 py-8 text-center text-slate-500" colSpan={7}>还没有官方资料。</td></tr>
            ) : materials.map((material) => (
              <tr key={material.id} className="border-t border-slate-100 align-top">
                <td className="px-4 py-4">
                  <div className="flex max-w-[330px] gap-3">
                    <FileText className={material.fileType === "pdf" ? "mt-0.5 shrink-0 text-red-500" : "mt-0.5 shrink-0 text-blue-600"} size={20} />
                    <div className="min-w-0">
                      <Link className="font-semibold text-ink transition hover:text-teal hover:underline" href={`/admin/ai-study-projects/materials/${material.id}/preview`}>
                        {material.title}
                      </Link>
                      <div className="mt-1 truncate text-xs text-slate-400" title={material.originalFileName}>{material.originalFileName} · {formatBytes(material.fileSizeBytes)}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4 text-slate-600">{getMaterialScopeName(material)}</td>
                <td className="px-4 py-4"><FileStatusBadge material={material} /></td>
                <td className="px-4 py-4"><VisibilityBadge visibility={material.visibility} /></td>
                <td className="px-4 py-4 text-slate-500">{formatDate(material.createdAt)}</td>
                <td className="px-4 py-4"><ProjectPurchaseUsers kind="official" projectId={material.id} title={material.title} purchaseCount={purchaseCounts[material.id] ?? 0} /></td>
                <td className="px-4 py-4">
                  <div className="flex min-w-[300px] flex-wrap gap-2">
                    <ProjectDiamondPriceSetting
                      kind="official"
                      projectId={material.id}
                      title={material.title}
                      diamondPrice={material.diamondPrice}
                      disabled={busyId === material.id}
                      onSaved={(diamondPrice) => setMaterials((current) => current.map((item) => item.id === material.id ? { ...item, diamondPrice } : item))}
                    />
                    <button className="secondary-button inline-flex items-center gap-1 px-3 py-2 text-xs" disabled={busyId === material.id} onClick={() => openEdit(material)} type="button"><Pencil size={14} />编辑</button>
                    {material.visibility === "public" ? (
                      <button className="secondary-button inline-flex items-center gap-1 px-3 py-2 text-xs" disabled={busyId === material.id} onClick={() => void changeVisibility(material, "unpublish")} type="button"><Lock size={14} />下架</button>
                    ) : (
                      <button className="secondary-button inline-flex items-center gap-1 px-3 py-2 text-xs" disabled={busyId === material.id || material.fileStatus !== "ready"} onClick={() => void changeVisibility(material, "publish")} type="button"><Globe2 size={14} />发布</button>
                    )}
                    <button className="secondary-button inline-flex items-center gap-1 px-3 py-2 text-xs text-red-700" disabled={busyId === material.id} onClick={() => void removeMaterial(material)} type="button"><Trash2 size={14} />删除</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-20">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-ink">编辑官方资料</h3>
              <button className="grid size-9 place-items-center rounded-full hover:bg-slate-100" disabled={Boolean(busyId)} onClick={() => setEditing(null)} type="button"><X size={20} /></button>
            </div>
            <div className="mt-5 grid gap-4">
              <label className="label">标题<input className="input mt-1" maxLength={120} onChange={(event) => setEditing({ ...editing, title: event.target.value })} value={editing.title} /></label>
              <label className="label">简介<textarea className="input mt-1 min-h-24" maxLength={2000} onChange={(event) => setEditing({ ...editing, description: event.target.value })} value={editing.description} /></label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="label">所属课程<select className="input mt-1" onChange={(event) => setEditing({ ...editing, scopeValue: event.target.value })} value={editing.scopeValue}><option value="">不指定课程</option><optgroup label="专业">{scopes.filter((scope) => scope.type === "major").map((scope) => <option key={`major:${scope.id}`} value={`major:${scope.id}`}>{scope.name}</option>)}</optgroup><optgroup label="公共课">{scopes.filter((scope) => scope.type === "public_subject").map((scope) => <option key={`public_subject:${scope.id}`} value={`public_subject:${scope.id}`}>{scope.name}</option>)}</optgroup></select></label>
                <label className="label">排序权重<input className="input mt-1" max={10000} min={-10000} onChange={(event) => setEditing({ ...editing, sortOrder: event.target.value })} type="number" value={editing.sortOrder} /></label>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button className="secondary-button" disabled={Boolean(busyId)} onClick={() => setEditing(null)} type="button">取消</button>
              <button className="primary-button" disabled={Boolean(busyId) || !editing.title.trim()} onClick={() => void saveEdit()} type="button">{busyId ? "保存中..." : "保存"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function FileStatusBadge({ material }: { material: AdminOfficialStudyMaterial }) {
  const label = material.fileStatus === "ready" ? "可用" : material.fileStatus === "failed" ? "处理失败" : "处理中";
  const className = material.fileStatus === "ready" ? "bg-emerald-50 text-emerald-700" : material.fileStatus === "failed" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700";
  return <span className={`badge ${className}`} title={material.processingError || ""}>{label}</span>;
}

function VisibilityBadge({ visibility }: { visibility: AdminOfficialStudyMaterial["visibility"] }) {
  const label = visibility === "public" ? "已发布" : visibility === "offline" ? "已下架" : "草稿";
  const className = visibility === "public" ? "bg-blue-50 text-blue-700" : visibility === "offline" ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-700";
  return <span className={`badge ${className}`}>{label}</span>;
}

function getMaterialScopeName(material: AdminOfficialStudyMaterial) {
  return material.major?.name || material.publicSubject?.name || material.course?.name || "未指定";
}

async function sendRequest<T = unknown>(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => null) as { ok?: boolean; data?: T; error?: { message?: string } } | null;
  if (response.ok && payload?.ok) {
    return payload.data as T;
  }
  throw new Error(payload?.error?.message || `请求失败：HTTP ${response.status}`);
}

function isSupportedFile(file: File) {
  return /\.pdf$/i.test(file.name);
}

function formatBytes(value: number) {
  if (value < 1024 * 1024) {
    return `${Math.max(1, Math.round(value / 1024))} KB`;
  }
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(value: Date | string) {
  return new Date(value).toLocaleString("zh-CN", {
    hour12: false,
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}
