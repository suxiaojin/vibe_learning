"use client";

import { useEffect, useRef, useState } from "react";
import { ImageUp, Save } from "lucide-react";
import { updateStudentNavIcons } from "@/app/admin/actions";
import { studentNavIconSlots, type StudentNavIconKey } from "@/lib/student-nav-icons";

export function AdminStudentNavIcons({
  iconUrls
}: {
  iconUrls: Record<StudentNavIconKey, string | null>;
}) {
  return (
    <form action={updateStudentNavIcons} className="border border-slate-200 bg-white p-5 shadow-sm" encType="multipart/form-data">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-lg font-black text-ink">学生端导航图标</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">上传后会替换学生端侧栏对应入口的图标；没有自定义图标时使用系统默认图标。</p>
        </div>
        <button className="primary-button rounded-none" type="submit">
          <Save size={16} />
          保存导航图标
        </button>
      </div>

      <div className="mt-4 grid gap-3">
        {studentNavIconSlots.map((slot) => (
          <StudentNavIconRow key={slot.key} iconKey={slot.key} label={slot.label} currentUrl={iconUrls[slot.key]} />
        ))}
      </div>

      <p className="mt-4 text-xs font-semibold leading-5 text-slate-500">支持 PNG 或 WebP，单个文件不超过 512KB。图片会统一缩放为 128 × 128 并保留透明背景；建议上传正方形图标。</p>
    </form>
  );
}

function StudentNavIconRow({
  currentUrl,
  iconKey,
  label
}: {
  currentUrl: string | null;
  iconKey: StudentNavIconKey;
  label: string;
}) {
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

  const previewUrl = reset ? null : selectedPreview ?? currentUrl;

  return (
    <div className="grid gap-3 border border-slate-200 p-3 sm:grid-cols-[72px_minmax(0,1fr)_minmax(220px,0.8fr)] sm:items-center">
      <div className="grid size-[60px] place-items-center rounded-xl border border-slate-200 bg-slate-50">
        {previewUrl ? (
          <img alt={`${label}图标预览`} className="size-10 object-contain" height={40} src={previewUrl} width={40} />
        ) : (
          <span className="px-1 text-center text-[10px] font-bold leading-4 text-slate-400">默认图标</span>
        )}
      </div>

      <div className="min-w-0">
        <p className="text-sm font-black text-ink">{label}</p>
        <p className="mt-1 text-xs font-semibold text-slate-500">{selectedPreview ? "待上传预览" : reset ? "保存后恢复默认图标" : currentUrl ? "当前自定义图标" : "当前使用默认图标"}</p>
      </div>

      <div className="grid gap-2">
        <label className="flex cursor-pointer items-center justify-center gap-2 border border-dashed border-slate-300 bg-slate-50 px-3 py-2.5 text-xs font-bold text-slate-600 transition hover:border-teal hover:bg-teal/5">
          <ImageUp className="shrink-0 text-teal" size={16} />
          <span>选择 PNG / WebP</span>
          <input
            accept=".png,.webp,image/png,image/webp"
            aria-label={`上传${label}图标`}
            className="sr-only"
            name={`studentNavIcon_${iconKey}_file`}
            onChange={(event) => handleFileChange(event.currentTarget.files?.[0])}
            type="file"
          />
        </label>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
          <input
            checked={reset}
            className="size-4 accent-teal"
            name={`studentNavIcon_${iconKey}_reset`}
            onChange={(event) => setReset(event.currentTarget.checked)}
            type="checkbox"
            value="true"
          />
          恢复此项默认图标
        </label>
      </div>
    </div>
  );
}
