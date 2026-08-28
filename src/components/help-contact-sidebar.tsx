"use client";

import { useEffect, useRef, useState } from "react";
import { Mail, MessageCircleMore, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Contact = "email" | "wechat";

export function HelpContactSidebar({ email, wechatQrCodeUrl }: { email: string; wechatQrCodeUrl: string }) {
  const sidebarRef = useRef<HTMLElement | null>(null);
  const qrDialogRef = useRef<HTMLDialogElement | null>(null);
  const [openContact, setOpenContact] = useState<Contact | null>(null);

  useEffect(() => {
    function closeOnOutsidePointer(event: PointerEvent) {
      if (event.target instanceof Node && !sidebarRef.current?.contains(event.target)) {
        setOpenContact(null);
      }
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenContact(null);
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <aside
      ref={sidebarRef}
      aria-label="联系客服"
      className="fixed right-4 top-1/2 z-40 -translate-y-1/2 rounded-2xl border border-slate-100 bg-white py-2 shadow-[0_6px_24px_rgba(15,23,42,0.08)]"
    >
      {([
        { key: "email", label: "邮件", icon: Mail },
        { key: "wechat", label: "微信", icon: MessageCircleMore }
      ] as const).map(({ key, label, icon: Icon }) => (
        <div
          key={key}
          className="relative"
          onPointerEnter={(event) => {
            if (event.pointerType === "mouse") setOpenContact(key);
          }}
          onPointerLeave={(event) => {
            if (event.pointerType === "mouse") setOpenContact(null);
          }}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setOpenContact(null);
          }}
        >
          <button
            aria-label={label}
            aria-controls={`help-contact-${key}`}
            aria-expanded={openContact === key}
            className={cn(
              "grid size-14 place-items-center rounded-xl transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal",
              openContact === key ? "text-teal" : "text-slate-700"
            )}
            onClick={() => setOpenContact(key)}
            onFocus={(event) => {
              if (event.currentTarget.matches(":focus-visible")) setOpenContact(key);
            }}
            type="button"
          >
            <Icon aria-hidden="true" size={24} strokeWidth={1.6} />
          </button>
          {openContact === key ? (
            <div className={cn("absolute right-full top-1/2 -translate-y-1/2 pr-3", key === "email" ? "w-[min(260px,calc(100vw-96px))]" : "w-[min(360px,calc(100vw-96px))]")}>
              <div
                aria-label={key === "email" ? "客服邮箱" : "客服微信"}
                className={cn("max-h-[calc(100dvh-8rem)] overflow-y-auto rounded-2xl border border-slate-100 bg-white text-center shadow-[0_6px_24px_rgba(15,23,42,0.08)]", key === "email" && "p-5")}
                id={`help-contact-${key}`}
                role="region"
              >
                {key === "email" ? (
                  <>
                    <p className="text-sm font-medium text-ink">客服邮箱</p>
                    <a className="mt-2 block break-all text-sm text-slate-600 hover:text-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal" href={`mailto:${email}`}>
                      {email}
                    </a>
                  </>
                ) : (
                  <>
                    {wechatQrCodeUrl ? (
                      <button
                        aria-label="放大客服微信二维码"
                        className="block w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal"
                        onClick={() => qrDialogRef.current?.showModal()}
                        type="button"
                      >
                        <img alt="客服微信二维码" className="h-auto w-full object-contain" src={wechatQrCodeUrl} />
                      </button>
                    ) : <p className="p-5 text-sm text-slate-500">客服微信二维码暂未配置</p>}
                  </>
                )}
              </div>
            </div>
          ) : null}
        </div>
      ))}
      <dialog
        ref={qrDialogRef}
        aria-label="客服微信二维码大图"
        className="m-auto max-h-[90dvh] w-[min(92vw,640px)] max-w-none rounded-2xl bg-white p-5 backdrop:bg-slate-900/40"
        onClick={(event) => {
          if (event.target === event.currentTarget) qrDialogRef.current?.close();
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-ink">微信扫码添加客服微信</p>
          <button aria-label="关闭二维码大图" className="grid size-11 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal" onClick={() => qrDialogRef.current?.close()} type="button">
            <X aria-hidden="true" size={20} />
          </button>
        </div>
        {wechatQrCodeUrl ? <img alt="客服微信二维码" className="mx-auto mt-3 h-auto max-h-[72dvh] max-w-full object-contain" src={wechatQrCodeUrl} /> : null}
      </dialog>
    </aside>
  );
}
