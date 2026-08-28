"use client";

import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Diamond, X } from "lucide-react";
import { setStudyProjectDiamondPrice } from "@/app/admin/ai-study-projects/actions";
import {
  formatProjectDiamondPrice,
  maxProjectDiamondPrice,
  projectDiamondPriceSchema,
  type ProjectDiamondPriceKind
} from "@/lib/project-diamond-price";

export function ProjectDiamondPriceSetting({
  kind,
  projectId,
  title,
  diamondPrice,
  disabled = false,
  onSaved
}: {
  kind: ProjectDiamondPriceKind;
  projectId: string;
  title: string;
  diamondPrice: number;
  disabled?: boolean;
  onSaved?: (diamondPrice: number) => void;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const [savedPrice, setSavedPrice] = useState(diamondPrice);
  const [value, setValue] = useState(String(diamondPrice));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => { setSavedPrice(diamondPrice); }, [diamondPrice]);

  function openDialog() {
    setValue(String(savedPrice));
    setError("");
    setNotice("");
    dialogRef.current?.showModal();
    inputRef.current?.focus();
    inputRef.current?.select();
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;
    const parsed = projectDiamondPriceSchema.safeParse(value.trim() === "" ? NaN : Number(value));
    if (!parsed.success) {
      setError("请填写有效的非负整数钻石数量。");
      return;
    }
    setIsSaving(true);
    setError("");
    try {
      const result = await setStudyProjectDiamondPrice({ kind, id: projectId, diamondPrice: parsed.data });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSavedPrice(result.diamondPrice);
      onSaved?.(result.diamondPrice);
      dialogRef.current?.close();
      setNotice(`已保存：${formatProjectDiamondPrice(result.diamondPrice)}`);
      router.refresh();
    } catch {
      setError("价格保存失败，请稍后重试。");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <button
        className="secondary-button inline-flex items-center gap-1 px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled || isSaving}
        onClick={openDialog}
        title={`当前价格：${formatProjectDiamondPrice(savedPrice)}`}
        type="button"
      >
        <Diamond aria-hidden size={14} />设置钻石：{savedPrice}
      </button>
      {notice ? <span className="self-center text-xs text-teal" role="status">{notice}</span> : null}
      <dialog
        ref={dialogRef}
        aria-labelledby={`${id}-title`}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 text-ink shadow-2xl backdrop:bg-black/50"
        onCancel={(event) => { if (isSaving) event.preventDefault(); }}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold" id={`${id}-title`}>设置钻石</h2>
          <button aria-label="关闭钻石设置" className="grid size-9 place-items-center rounded-full hover:bg-slate-100" disabled={isSaving} onClick={() => dialogRef.current?.close()} type="button"><X size={20} /></button>
        </div>
        <p className="mt-2 break-words text-sm text-slate-600">{title}</p>
        <form className="mt-5" onSubmit={save}>
          <label className="label" htmlFor={`${id}-amount`}>钻石数量</label>
          <input
            ref={inputRef}
            aria-describedby={error ? `${id}-error` : undefined}
            aria-invalid={Boolean(error)}
            className="input mt-1"
            disabled={isSaving}
            id={`${id}-amount`}
            max={maxProjectDiamondPrice}
            min={0}
            onChange={(event) => { setValue(event.target.value); setError(""); }}
            required
            step={1}
            type="number"
            value={value}
          />
          {error ? <p className="mt-3 text-sm text-red-700" id={`${id}-error`} role="alert">{error}</p> : null}
          <div className="mt-6 flex justify-end gap-3">
            <button className="secondary-button" disabled={isSaving} onClick={() => dialogRef.current?.close()} type="button">取消</button>
            <button className="primary-button" disabled={isSaving} type="submit">{isSaving ? "保存中..." : "保存"}</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
