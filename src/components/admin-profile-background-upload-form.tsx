"use client";

import { useEffect, useRef, useState } from "react";
import { ImageUp, Save } from "lucide-react";
import { useFormStatus } from "react-dom";
import { updateProfileHomepageBackgroundSettings } from "@/app/admin/actions";

export function AdminProfileBackgroundUploadForm({
  currentBackgroundImageUrl
}: {
  currentBackgroundImageUrl: string;
}) {
  const previewUrlRef = useRef("");
  const [previewUrl, setPreviewUrl] = useState(currentBackgroundImageUrl);
  const [selectedFileName, setSelectedFileName] = useState("");

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
    }
    previewUrlRef.current = URL.createObjectURL(file);
    setPreviewUrl(previewUrlRef.current);
    setSelectedFileName(file.name);
  }

  return (
    <section className="border border-slate-200 bg-white p-5 shadow-sm">
      <div className="border-b border-slate-100 pb-4">
        <h2 className="text-lg font-black text-ink">背景图配置</h2>
        <p className="mt-1 text-sm font-semibold text-slate-500">
          保存后将设为系统默认图，并立即覆盖所有现有用户“我的主页”和对外个人主页的背景。
        </p>
      </div>

      <form
        action={updateProfileHomepageBackgroundSettings}
        className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]"
        encType="multipart/form-data"
      >
        <div className="min-w-0">
          <p className="label">当前展示效果</p>
          <div className="mt-2 aspect-[9/2] min-h-44 overflow-hidden border border-slate-200 bg-slate-50">
            {previewUrl ? (
              <img
                alt={selectedFileName ? "待上传的个人主页背景图" : "当前个人主页背景图"}
                className="size-full object-cover"
                src={previewUrl}
              />
            ) : (
              <div className="grid size-full min-h-44 place-items-center px-6 text-center text-sm font-semibold leading-6 text-slate-400">
                尚未配置系统默认背景图
              </div>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-col">
          <label className="label" htmlFor="profileHomepageBackgroundFile">上传背景图片</label>
          <label
            className="mt-2 flex min-h-40 cursor-pointer flex-col items-center justify-center border border-dashed border-slate-300 bg-slate-50 px-5 py-6 text-center text-sm font-bold text-slate-600 transition hover:border-[#0872b9] hover:bg-blue-50 focus-within:border-[#0872b9] focus-within:ring-2 focus-within:ring-[#0872b9]/15"
            htmlFor="profileHomepageBackgroundFile"
          >
            <ImageUp className="mb-2 text-[#0872b9]" size={28} />
            <span>{selectedFileName || "选择 PNG、JPG 或 WEBP 图片"}</span>
            <span className="mt-2 text-xs font-semibold leading-5 text-slate-500">
              最大 2MB；建议使用 1800 × 400 左右的横版图片，重要内容放在画面中央。
            </span>
            <input
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              id="profileHomepageBackgroundFile"
              name="profileHomepageBackgroundFile"
              onChange={handleFileChange}
              required
              type="file"
            />
          </label>

          <div className="mt-4 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold leading-5 text-slate-600">
            管理员和用户都可以再次上传覆盖：最后一次上传的图片生效，不设置固定优先级。
          </div>

          <div className="mt-auto pt-5">
            <ProfileBackgroundSubmitButton disabled={!selectedFileName} />
          </div>
        </div>
      </form>
    </section>
  );
}

function ProfileBackgroundSubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button className="primary-button rounded-none" disabled={disabled || pending} type="submit">
      <Save size={16} />
      {pending ? "上传中..." : "保存背景图"}
    </button>
  );
}
