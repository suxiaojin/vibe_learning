"use client";

import { Trash2 } from "lucide-react";
import { useFormStatus } from "react-dom";

export function AdminAiPromptProfileDeleteButton({ profileName }: { profileName: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      aria-label={`删除 Prompt 档案 ${profileName}`}
      className="flex size-8 items-center justify-center border border-transparent text-red-400 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
      disabled={pending}
      onClick={(event) => {
        if (!window.confirm(`确认删除“${profileName}”吗？\n\n已绑定的专业将自动恢复使用通用 AI解释，此操作不可撤销。`)) {
          event.preventDefault();
        }
      }}
      title="删除 Prompt 档案"
      type="submit"
    >
      <Trash2 size={15} />
    </button>
  );
}
