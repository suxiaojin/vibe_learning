"use client";

import { Trash2 } from "lucide-react";
import { useFormStatus } from "react-dom";

export function AdminAiPromptVersionDeleteButton({
  isActive,
  profileName,
  version
}: {
  isActive: boolean;
  profileName: string;
  version: number;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      aria-label={`删除 ${profileName} 的版本 v${version}`}
      className="flex size-9 items-center justify-center border border-transparent text-red-400 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:cursor-not-allowed disabled:opacity-50"
      disabled={pending}
      onClick={(event) => {
        const effect = isActive
          ? "这是当前线上版本。删除后将自动切换到剩余版本中版本号最高的一版；如果没有剩余版本，则回退使用通用 AI解释。"
          : "删除后当前线上版本保持不变。";
        if (!window.confirm(`确认删除“${profileName}”的 v${version} 吗？\n\n${effect}\n\n历史 AI 会话会保留，但不再关联到该版本。此操作不可撤销。`)) {
          event.preventDefault();
        }
      }}
      title={`删除 v${version}`}
      type="submit"
    >
      <Trash2 size={15} />
    </button>
  );
}
