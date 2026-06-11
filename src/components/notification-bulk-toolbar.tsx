"use client";

import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";

export function NotificationBulkToolbar({ formId, itemCount }: { formId: string; itemCount: number }) {
  const [selectedCount, setSelectedCount] = useState(0);

  useEffect(() => {
    const inputs = Array.from(document.querySelectorAll<HTMLInputElement>(`input[form="${formId}"][name="selectedIds"]`));
    const updateCount = () => setSelectedCount(inputs.filter((input) => input.checked).length);
    inputs.forEach((input) => input.addEventListener("change", updateCount));
    updateCount();
    return () => inputs.forEach((input) => input.removeEventListener("change", updateCount));
  }, [formId, itemCount]);

  const allSelected = itemCount > 0 && selectedCount === itemCount;

  return (
    <div className="flex min-h-14 items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4">
      <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-bold text-slate-600">
        <input
          checked={allSelected}
          className="size-4 accent-teal"
          type="checkbox"
          onChange={(event) => {
            document.querySelectorAll<HTMLInputElement>(`input[form="${formId}"][name="selectedIds"]`).forEach((input) => {
              input.checked = event.target.checked;
            });
            setSelectedCount(event.target.checked ? itemCount : 0);
          }}
        />
        全选
      </label>
      <ConfirmSubmitButton
        className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-red-200 bg-white px-3 text-sm font-bold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
        disabled={selectedCount === 0}
        form={formId}
        message={`确定删除选中的 ${selectedCount} 条消息吗？删除后无法恢复。`}
      >
        <Trash2 size={16} />
        删除所选{selectedCount > 0 ? ` (${selectedCount})` : ""}
      </ConfirmSubmitButton>
    </div>
  );
}
