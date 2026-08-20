"use client";

import { useEffect, useRef, useState } from "react";
import { ImageUp, Save } from "lucide-react";
import { useFormStatus } from "react-dom";
import { updateDiamondRechargeQrSettings } from "@/app/admin/actions";

export function AdminRechargeQrUploadForm({ currentQrCodeUrl }: { currentQrCodeUrl: string }) {
  const previewUrlRef = useRef("");
  const [previewUrl, setPreviewUrl] = useState(currentQrCodeUrl);
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
        <h2 className="text-lg font-black text-ink">钻石充值客服二维码</h2>
        <p className="mt-1 text-sm font-semibold text-slate-500">上传后，学生端“个人档案 - 我的钻石”会显示这张图片。</p>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[320px_1fr]">
        <div>
          <p className="label">当前展示效果</p>
          <div className="mt-2 flex min-h-80 items-center justify-center overflow-hidden border border-slate-200 bg-slate-50 p-3">
            {previewUrl ? (
              <img
                alt={selectedFileName ? "待上传的钻石充值微信客服二维码" : "当前钻石充值微信客服二维码"}
                className="max-h-[420px] w-full object-contain"
                src={previewUrl}
              />
            ) : (
              <div className="px-6 text-center text-sm font-semibold leading-6 text-slate-400">
                尚未配置二维码
              </div>
            )}
          </div>
        </div>

        <form action={updateDiamondRechargeQrSettings} className="flex flex-col" encType="multipart/form-data">
          <label className="label" htmlFor="diamondRechargeQrCodeFile">上传二维码图片</label>
          <label
            className="mt-2 flex min-h-40 cursor-pointer flex-col items-center justify-center border border-dashed border-slate-300 bg-slate-50 px-5 py-6 text-center text-sm font-bold text-slate-600 transition hover:border-[#0872b9] hover:bg-blue-50 focus-within:border-[#0872b9] focus-within:ring-2 focus-within:ring-[#0872b9]/15"
            htmlFor="diamondRechargeQrCodeFile"
          >
            <ImageUp className="mb-2 text-[#0872b9]" size={28} />
            <span>{selectedFileName || "选择 PNG、JPG 或 WEBP 图片"}</span>
            <span className="mt-2 text-xs font-semibold leading-5 text-slate-500">最大 2MB；建议使用清晰、留白适中的竖版或方形二维码图片。</span>
            <input
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              id="diamondRechargeQrCodeFile"
              name="diamondRechargeQrCodeFile"
              onChange={handleFileChange}
              required
              type="file"
            />
          </label>

          <div className="mt-4 rounded border border-sky-100 bg-sky-50 px-4 py-3 text-xs font-semibold leading-5 text-slate-600">
            新图片保存成功后会覆盖当前配置；图片内容存入系统设置，可由管理员端和学生端共同读取。
          </div>

          <div className="mt-auto pt-5">
            <RechargeQrSubmitButton disabled={!selectedFileName} />
          </div>
        </form>
      </div>
    </section>
  );
}

function RechargeQrSubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button className="primary-button rounded-none" disabled={disabled || pending} type="submit">
      <Save size={16} />
      {pending ? "上传中..." : "保存二维码"}
    </button>
  );
}
