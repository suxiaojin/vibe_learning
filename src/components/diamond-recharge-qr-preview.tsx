"use client";

import { useRef } from "react";
import { X } from "lucide-react";

export function DiamondRechargeQrPreview({ src }: { src: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  function openPreview() {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  }

  function closePreview() {
    dialogRef.current?.close();
  }

  return (
    <>
      <button
        aria-haspopup="dialog"
        aria-label="在当前页面查看微信客服二维码大图"
        className="mt-4 block w-full cursor-zoom-in overflow-hidden rounded-xl border border-sky-100 bg-white p-2 text-left shadow-sm transition hover:border-sky-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/20"
        type="button"
        onClick={openPreview}
      >
        <img alt="钻石充值微信客服二维码" className="h-auto w-full object-contain" src={src} />
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="diamond-recharge-qr-preview-title"
        className="m-auto max-h-[calc(100dvh-2rem)] w-[min(92vw,560px)] overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-ink shadow-2xl backdrop:bg-slate-950/60 backdrop:backdrop-blur-[2px]"
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            closePreview();
          }
        }}
      >
        <section className="flex max-h-[calc(100dvh-2rem)] min-h-0 flex-col">
          <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
            <h2 className="text-xl font-semibold text-ink" id="diamond-recharge-qr-preview-title">
              钻石充值
            </h2>
            <button
              aria-label="关闭二维码大图"
              className="grid size-11 shrink-0 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/30"
              title="关闭"
              type="button"
              onClick={closePreview}
            >
              <X aria-hidden="true" size={22} />
            </button>
          </header>

          <div className="min-h-0 overflow-auto bg-slate-50 p-4 sm:p-6">
            <img
              alt="钻石充值微信客服二维码大图"
              className="mx-auto h-auto max-h-[calc(100dvh-10rem)] max-w-full rounded-xl border border-slate-200 bg-white object-contain shadow-sm"
              src={src}
            />
          </div>
        </section>
      </dialog>
    </>
  );
}
