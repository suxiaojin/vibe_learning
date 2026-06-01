"use client";

import type { ReactNode } from "react";
import { useRef, useState } from "react";

const avatarMaxBytes = 800 * 1024;
const allowedAvatarTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export function AvatarUploadForm({
  action,
  children,
  errorText
}: {
  action: (formData: FormData) => void | Promise<void>;
  children: ReactNode;
  errorText?: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const displayError = clientError || errorText || null;

  return (
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
      {displayError ? <p className="mt-3 max-w-40 text-sm font-bold leading-5 text-coral">{displayError}</p> : null}
    </form>
  );
}
