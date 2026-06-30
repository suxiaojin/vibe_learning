"use client";

import { Check, ChevronDown, Upload } from "lucide-react";
import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { DEFAULT_AVATARS } from "@/lib/default-avatars";
import { cn } from "@/lib/utils";

const avatarMaxBytes = 800 * 1024;
const allowedAvatarTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export function AvatarUploadForm({
  action,
  children,
  currentAvatarImage,
  errorText
}: {
  action: (formData: FormData) => void | Promise<void>;
  children: ReactNode;
  currentAvatarImage?: string;
  errorText?: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const displayError = clientError || errorText || null;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4">
        <form action={action} ref={formRef}>
          <button
            aria-label="上传头像"
            className="block rounded-full text-left outline-none ring-offset-4 transition hover:scale-[1.03] focus-visible:ring-2 focus-visible:ring-teal"
            title="上传头像"
            type="button"
            onClick={() => inputRef.current?.click()}
          >
            {children}
          </button>
          <input
            ref={inputRef}
            className="sr-only"
            name="avatarImage"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={() => {
              const input = inputRef.current;
              const file = input?.files?.[0];
              if (!file) {
                return;
              }

              if (file.size > avatarMaxBytes) {
                setClientError("上传失败，大小不超过 800KB");
                input.value = "";
                return;
              }

              if (!allowedAvatarTypes.has(file.type)) {
                setClientError("上传失败，仅支持 JPG、PNG、WebP");
                input.value = "";
                return;
              }

              setClientError(null);
              if (input.files?.length) {
                formRef.current?.requestSubmit();
              }
            }}
          />
        </form>

        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <button
              className="secondary-button min-h-10 rounded-xl px-4 text-sm"
              type="button"
              onClick={() => inputRef.current?.click()}
            >
              <Upload size={16} />
              上传头像
            </button>
            <button
              aria-expanded={pickerOpen}
              className="secondary-button min-h-10 rounded-xl px-4 text-sm"
              type="button"
              onClick={() => setPickerOpen((open) => !open)}
            >
              选择系统头像
              <ChevronDown className={cn("transition", pickerOpen ? "rotate-180" : "")} size={16} />
            </button>
          </div>
          <p className="text-xs font-semibold text-slate-400">支持 JPG、PNG、WebP，最大 800KB。</p>
        </div>
      </div>

      {pickerOpen ? (
        <div className="mt-4 max-w-md rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-slate-700">系统头像</span>
            <span className="text-xs font-semibold text-slate-400">点击头像即保存</span>
          </div>
          <div className="grid grid-cols-4 gap-3 sm:grid-cols-6">
            {DEFAULT_AVATARS.map((avatar) => {
              const active = currentAvatarImage === avatar.src;

              return (
                <form action={action} key={avatar.id}>
                  <input name="presetAvatarImage" type="hidden" value={avatar.src} />
                  <button
                    aria-label={`选择${avatar.label}`}
                    className={cn(
                      "relative block rounded-full bg-white p-0.5 outline-none ring-offset-2 transition hover:scale-[1.04] focus-visible:ring-2 focus-visible:ring-teal",
                      active ? "ring-2 ring-teal" : "ring-1 ring-slate-200 hover:ring-teal/40"
                    )}
                    title={avatar.label}
                    type="submit"
                  >
                    <img alt={avatar.label} className="size-12 rounded-full object-cover" src={avatar.src} />
                    {active ? (
                      <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-teal text-white shadow-sm">
                        <Check size={13} />
                      </span>
                    ) : null}
                  </button>
                </form>
              );
            })}
          </div>
        </div>
      ) : null}

      {displayError ? <p className="mt-3 max-w-md text-sm font-bold leading-5 text-coral">{displayError}</p> : null}
    </div>
  );
}
