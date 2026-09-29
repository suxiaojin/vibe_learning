"use client";

import { useEffect, useRef, useState } from "react";
import { ImageUp, Save } from "lucide-react";
import { updateMajorCourseCenterIcon } from "@/app/admin/actions";

type MajorIconItem = {
  id: string;
  name: string;
  status: string;
  iconUrl: string | null;
};

export function AdminMajorCourseIcons({ majors }: { majors: MajorIconItem[] }) {
  return (
    <section className="border border-slate-200 bg-white p-5 shadow-sm">
      <div className="border-b border-slate-100 pb-4">
        <h2 className="text-lg font-black text-ink">课程中心专业图标</h2>
        <p className="mt-1 text-sm font-semibold text-slate-500">按专业分别设置图标；学生课程中心会显示其当前专业对应的图标。</p>
      </div>

      {majors.length > 0 ? (
        <div className="mt-4 grid gap-3">
          {majors.map((major) => <MajorIconRow key={major.id} major={major} />)}
        </div>
      ) : (
        <p className="mt-4 text-sm font-semibold text-slate-500">目前没有专业记录。</p>
      )}

      <p className="mt-4 text-xs font-semibold leading-5 text-slate-500">支持 PNG 或 WebP，单个文件不超过 512KB。图片会统一缩放为 128 × 128 并保留透明背景；建议上传正方形图标。</p>
    </section>
  );
}

function MajorIconRow({ major }: { major: MajorIconItem }) {
  const [selectedPreview, setSelectedPreview] = useState<string | null>(null);
  const [reset, setReset] = useState(false);
  const previewRef = useRef<string | null>(null);

  useEffect(() => () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
  }, []);

  function handleFileChange(file?: File) {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = file ? URL.createObjectURL(file) : null;
    setSelectedPreview(previewRef.current);
    if (file) setReset(false);
  }

  const previewUrl = reset ? null : selectedPreview ?? major.iconUrl;
  const statusLabel = major.status === "published" ? "已发布" : major.status === "draft" ? "草稿" : "已归档";

  return (
    <form action={updateMajorCourseCenterIcon} className="grid gap-3 border border-slate-200 p-3 sm:grid-cols-[72px_minmax(0,1fr)_minmax(220px,0.8fr)] sm:items-center" encType="multipart/form-data">
      <input name="majorId" type="hidden" value={major.id} />
      <div className="grid size-[60px] place-items-center rounded-xl border border-slate-200 bg-slate-50">
        {previewUrl ? (
          <img alt={`${major.name}专业图标预览`} className="size-10 object-contain" height={40} src={previewUrl} width={40} />
        ) : (
          <span className="px-1 text-center text-[10px] font-bold leading-4 text-slate-400">默认图标</span>
        )}
      </div>

      <div className="min-w-0">
        <p className="truncate text-sm font-black text-ink">{major.name}</p>
        <p className="mt-1 text-xs font-semibold text-slate-500">{selectedPreview ? "待上传预览" : reset ? "保存后恢复默认图标" : major.iconUrl ? "当前自定义图标" : "当前使用默认图标"} · {statusLabel}</p>
      </div>

      <div className="grid gap-2">
        <div className="flex gap-2">
          <label className="flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-2 border border-dashed border-slate-300 bg-slate-50 px-3 py-2.5 text-xs font-bold text-slate-600 transition hover:border-teal hover:bg-teal/5">
            <ImageUp className="shrink-0 text-teal" size={16} />
            <span>选择 PNG / WebP</span>
            <input
              accept=".png,.webp,image/png,image/webp"
              aria-label={`上传${major.name}专业图标`}
              className="sr-only"
              name="majorCourseCenterIconFile"
              onChange={(event) => handleFileChange(event.currentTarget.files?.[0])}
              type="file"
            />
          </label>
          <button className="primary-button shrink-0 rounded-none px-3" type="submit" aria-label={`保存${major.name}专业图标`}>
            <Save size={15} />
            保存
          </button>
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
          <input
            checked={reset}
            className="size-4 accent-teal"
            name="resetMajorCourseCenterIcon"
            onChange={(event) => setReset(event.currentTarget.checked)}
            type="checkbox"
            value="true"
          />
          恢复默认专业图标
        </label>
      </div>
    </form>
  );
}
