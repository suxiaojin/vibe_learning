"use client";

import { useEffect, useId, useRef } from "react";
import { BookOpenText, Gem, Loader2, ShoppingCart, X } from "lucide-react";
import { DiamondInsufficientMessage } from "@/components/diamond-insufficient-message";
import { isDiamondInsufficientMessage } from "@/lib/diamond-insufficient";

export function ProjectPurchaseFeedback({ error, onClose, confirmation, pending = false }: {
  error: string;
  onClose: () => void;
  confirmation?: { title: string; diamondPrice: number; onConfirm: () => void };
  pending?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const visible = Boolean(error || confirmation);
  useEffect(() => {
    if (visible && !ref.current?.open) ref.current?.showModal();
    if (!visible && ref.current?.open) ref.current.close();
  }, [visible]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={confirmation ? descriptionId : undefined}
      aria-busy={pending}
      className={confirmation
        ? "m-auto max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-[400px] overflow-y-auto rounded-xl border border-white bg-white p-0 text-ink shadow-2xl backdrop:bg-[#1e2828]/40 backdrop:backdrop-blur-[3px]"
        : "m-auto w-[calc(100%_-_2rem)] max-w-sm rounded-lg border border-slate-200 bg-white p-5 text-ink shadow-xl backdrop:bg-black/30"}
      onClose={onClose}
      onCancel={(event) => { if (pending) event.preventDefault(); }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          if (!pending) ref.current?.close();
        }
      }}
      onClick={(event) => { if (!pending && event.target === event.currentTarget) ref.current?.close(); }}
    >
      <div className={confirmation ? "flex items-center justify-between gap-4 border-b border-[#dce1e1] bg-[#f7f9f9] px-5 py-3" : "flex items-center justify-between gap-4"}>
        <h2 className={confirmation ? "text-lg font-bold leading-7 text-[#111818]" : "text-lg font-bold"} id={titleId}>{confirmation ? "购买确认" : "项目购买"}</h2>
        <button aria-label="关闭" className="grid size-9 shrink-0 place-items-center rounded text-[#30403f] hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal disabled:opacity-50" disabled={pending} onClick={() => ref.current?.close()} title="关闭" type="button">
          <X size={confirmation ? 20 : 18} />
        </button>
      </div>
      {confirmation ? (
        <div className="p-5 text-center" id={descriptionId}>
          <div aria-hidden className="mx-auto grid size-16 place-items-center rounded-full bg-[#c1dede] text-[#008579]">
            <BookOpenText className="size-8" strokeWidth={2} />
          </div>
          <p className="mt-3 break-words text-lg font-bold leading-7 text-[#101717]">{confirmation.title}</p>
          <p className="mt-5 flex min-h-14 flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-lg bg-[#c5e9f8] px-3 py-3 text-sm leading-6 text-[#426775]">
            <span>本次购买将扣减</span>
            <span className="inline-flex items-center gap-2 whitespace-nowrap">
              <strong className="text-2xl font-semibold leading-8 tabular-nums text-[#006b61]">{confirmation.diamondPrice}</strong>
              <Gem aria-hidden size={20} />
              <span>钻石</span>
            </span>
          </p>
          <p className="mx-auto mt-4 max-w-[320px] text-balance text-[13px] leading-[22px] text-gray-500">确认购买后，将立即扣除相应数量钻石，该操作不可撤销</p>
        </div>
      ) : null}
      {error ? (
        <div className={confirmation ? "break-words px-5 pb-4 text-sm leading-7" : "mt-4 break-words text-sm leading-7"} role="status">
          {isDiamondInsufficientMessage(error) ? <DiamondInsufficientMessage /> : error}
        </div>
      ) : null}
      {confirmation ? (
        <div className="grid grid-cols-2 gap-3 border-t border-[#dce1e1] bg-[#f7f9f9] px-5 py-4">
          <button className="min-h-11 rounded-lg border border-[#afc5c3] bg-white px-3 text-sm font-semibold text-[#006b61] hover:bg-[#edf5f4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal disabled:opacity-50" disabled={pending} onClick={() => ref.current?.close()} type="button">取消</button>
          <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[#006b61] bg-[#006b61] px-3 text-sm font-semibold text-white hover:bg-[#005b53] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal disabled:opacity-60" disabled={pending} onClick={confirmation.onConfirm} type="button">
            {pending ? <Loader2 aria-hidden className="animate-spin" size={18} /> : <ShoppingCart aria-hidden size={18} />}
            {pending ? "购买中" : "确认购买"}
          </button>
        </div>
      ) : null}
    </dialog>
  );
}
