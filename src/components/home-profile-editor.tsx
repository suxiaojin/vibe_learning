"use client";

import { Camera, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

const avatarColors = [
  { key: "green", className: "bg-[#58cc02]" },
  { key: "sky", className: "bg-sky-500" },
  { key: "coral", className: "bg-coral" },
  { key: "honey", className: "bg-honey" },
  { key: "violet", className: "bg-violet-500" }
];

export function HomeProfileEditor({
  action,
  avatarColor,
  avatarImage,
  bio,
  coverImage,
  modalId,
  name,
  openInitially
}: {
  action: (formData: FormData) => void | Promise<void>;
  avatarColor: string;
  avatarImage: string;
  bio: string;
  coverImage: string;
  modalId: string;
  name: string;
  openInitially: boolean;
}) {
  const [avatarPreview, setAvatarPreview] = useState("");
  const [coverPreview, setCoverPreview] = useState("");
  const activeAvatar = avatarPreview || avatarImage;
  const activeCover = coverPreview || coverImage;

  useEffect(() => () => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    if (coverPreview) URL.revokeObjectURL(coverPreview);
  }, [avatarPreview, coverPreview]);

  return (
    <>
      <input className="peer sr-only" defaultChecked={openInitially} id={modalId} type="checkbox" />
      <div className="fixed inset-0 z-50 hidden overflow-y-auto bg-ink/35 px-4 py-8 peer-checked:block">
        <form action={action} className="relative mx-auto w-full max-w-3xl rounded-2xl bg-white p-5 shadow-[0_18px_60px_rgba(15,23,42,0.24)]" encType="multipart/form-data">
          <div className="mb-5 flex items-center justify-between gap-3">
            <label className="grid size-10 cursor-pointer place-items-center rounded-full text-ink hover:bg-slate-100" htmlFor={modalId}>
              <X size={24} />
            </label>
            <h3 className="text-2xl font-black text-ink">编辑个人资料</h3>
            <button className="min-h-10 rounded-full bg-ink px-6 text-sm font-black text-white transition hover:bg-slate-700" type="submit">
              保存
            </button>
          </div>

          <label className="block cursor-pointer">
            <span className="label">背景图</span>
            <span
              className="relative block h-56 overflow-hidden rounded-xl bg-slate-200 bg-cover bg-center md:h-72"
              style={activeCover ? { backgroundImage: `url(${activeCover})` } : undefined}
            >
              <span className="absolute inset-0 grid place-items-center bg-black/10">
                <span className="grid size-14 place-items-center rounded-full bg-ink/70 text-white">
                  <Camera size={24} />
                </span>
              </span>
            </span>
            <span className="mt-2 block text-xs font-semibold text-slate-400">建议分辨率 1500 x 500，支持 JPG、PNG、WebP，最大 2MB。</span>
            <input
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              name="coverImage"
              type="file"
              onChange={(event) => {
                const nextUrl = createPreviewUrl(event.currentTarget.files?.[0]);
                setCoverPreview((current) => {
                  if (current) URL.revokeObjectURL(current);
                  return nextUrl;
                });
              }}
            />
          </label>

          <div className="mt-5 grid gap-5 md:grid-cols-[180px_minmax(0,1fr)]">
            <label className="cursor-pointer">
              <span className="label">头像</span>
              <span className="relative block w-fit">
                <EditorAvatar color={avatarColor} image={activeAvatar} name={name} />
                <span className="absolute inset-0 grid place-items-center rounded-full bg-black/20 text-white">
                  <Camera size={22} />
                </span>
              </span>
              <span className="mt-2 block text-xs font-semibold leading-5 text-slate-400">建议 400 x 400，最大 800KB。</span>
              <input
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                name="avatarImage"
                type="file"
                onChange={(event) => {
                  const nextUrl = createPreviewUrl(event.currentTarget.files?.[0]);
                  setAvatarPreview((current) => {
                    if (current) URL.revokeObjectURL(current);
                    return nextUrl;
                  });
                }}
              />
            </label>
            <div className="space-y-4">
              <label>
                <span className="label">昵称</span>
                <input className="input" maxLength={30} name="nickname" defaultValue={name} />
              </label>
              <label>
                <span className="label">简介</span>
                <textarea className="input min-h-32 resize-y leading-7" maxLength={300} name="bio" defaultValue={bio} />
              </label>
            </div>
          </div>
        </form>
      </div>
    </>
  );
}

function EditorAvatar({ color, image, name }: { color: string; image: string; name: string }) {
  const colorClass = useMemo(
    () => avatarColors.find((item) => item.key === color)?.className || avatarColors[0].className,
    [color]
  );

  if (image) {
    return <img alt={`${name} 的头像`} className="size-28 shrink-0 rounded-full object-cover shadow-soft" src={image} />;
  }

  return (
    <span className={cn("grid size-28 shrink-0 place-items-center rounded-full text-5xl font-black text-white shadow-soft", colorClass)}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function createPreviewUrl(file?: File) {
  return file ? URL.createObjectURL(file) : "";
}
