"use client";

import { Check, ChevronDown, Loader2, Upload } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { DEFAULT_AVATARS } from "@/lib/default-avatars";
import { cn } from "@/lib/utils";

const avatarMaxBytes = 800 * 1024;
const allowedAvatarTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const avatarUpdatedEventName = "vibe:avatar-updated";

type AvatarApiResponse = {
  avatarImage?: string;
  error?: string;
};

export function AvatarUploadForm({
  children,
  currentAvatarImage,
  errorText
}: {
  children: ReactNode;
  currentAvatarImage?: string;
  errorText?: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [savedAvatarImage, setSavedAvatarImage] = useState(currentAvatarImage || "");
  const [clientError, setClientError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [serverErrorVisible, setServerErrorVisible] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [successText, setSuccessText] = useState<string | null>(null);
  const displayAvatarImage = savedAvatarImage || currentAvatarImage || "";
  const displayError = clientError || (serverErrorVisible ? errorText : null) || null;

  useEffect(() => {
    setSavedAvatarImage(currentAvatarImage || "");
  }, [currentAvatarImage]);

  useEffect(() => {
    setServerErrorVisible(true);
  }, [errorText]);

  useEffect(() => {
    if (!successText) {
      return;
    }

    const timeoutId = window.setTimeout(() => setSuccessText(null), 2400);
    return () => window.clearTimeout(timeoutId);
  }, [successText]);

  async function saveAvatar(formData: FormData) {
    setClientError(null);
    setServerErrorVisible(false);
    setSuccessText(null);
    setIsSaving(true);

    try {
      const response = await fetch("/api/student/avatar", {
        method: "POST",
        body: formData
      });
      const data = (await response.json().catch(() => ({}))) as AvatarApiResponse;

      if (!response.ok || !data.avatarImage) {
        throw new Error(data.error || "头像保存失败，请稍后重试");
      }

      setSavedAvatarImage(data.avatarImage);
      setSuccessText("头像已更新");
      window.dispatchEvent(new CustomEvent(avatarUpdatedEventName, { detail: { avatarImage: data.avatarImage } }));
    } catch (error) {
      setClientError(error instanceof Error ? error.message : "头像保存失败，请稍后重试");
    } finally {
      setIsSaving(false);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }

  function handleFileChange() {
    const input = inputRef.current;
    const file = input?.files?.[0];
    if (!file) {
      return;
    }

    setServerErrorVisible(false);
    setSuccessText(null);

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

    const formData = new FormData();
    formData.append("avatarImage", file);
    void saveAvatar(formData);
  }

  function handlePresetAvatar(avatarImage: string) {
    const formData = new FormData();
    formData.append("presetAvatarImage", avatarImage);
    void saveAvatar(formData);
  }

  return (
    <div aria-busy={isSaving}>
      <div className="flex flex-wrap items-center gap-4">
        <button
          aria-label="上传头像"
          className="block rounded-full text-left outline-none ring-offset-4 transition hover:scale-[1.03] focus-visible:ring-2 focus-visible:ring-teal disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
          disabled={isSaving}
          title="上传头像"
          type="button"
          onClick={() => inputRef.current?.click()}
        >
          {displayAvatarImage ? (
            <img alt="当前头像" className="size-24 shrink-0 rounded-full object-cover shadow-soft" src={displayAvatarImage} />
          ) : (
            children
          )}
        </button>
        <input
          ref={inputRef}
          className="sr-only"
          name="avatarImage"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={handleFileChange}
        />

        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <button
              className="secondary-button min-h-11 rounded-xl px-4 text-sm"
              disabled={isSaving}
              type="button"
              onClick={() => inputRef.current?.click()}
            >
              {isSaving ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
              {isSaving ? "保存中" : "上传头像"}
            </button>
            <button
              aria-expanded={pickerOpen}
              className="secondary-button min-h-11 rounded-xl px-4 text-sm"
              disabled={isSaving}
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
              const active = displayAvatarImage === avatar.src;

              return (
                <button
                  aria-label={`选择${avatar.label}`}
                  className={cn(
                    "relative block rounded-full bg-white p-0.5 outline-none ring-offset-2 transition hover:scale-[1.04] focus-visible:ring-2 focus-visible:ring-teal disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100",
                    active ? "ring-2 ring-teal" : "ring-1 ring-slate-200 hover:ring-teal/40"
                  )}
                  disabled={isSaving}
                  key={avatar.id}
                  title={avatar.label}
                  type="button"
                  onClick={() => handlePresetAvatar(avatar.src)}
                >
                  <img alt={avatar.label} className="size-12 rounded-full object-cover" src={avatar.src} />
                  {active ? (
                    <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-teal text-white shadow-sm">
                      <Check size={13} />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {displayError ? <p className="mt-3 max-w-md text-sm font-bold leading-5 text-coral">{displayError}</p> : null}
      {!displayError && successText ? <p className="mt-3 max-w-md text-sm font-bold leading-5 text-teal">{successText}</p> : null}
    </div>
  );
}
