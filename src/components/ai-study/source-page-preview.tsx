"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, Loader2, X } from "lucide-react";

export function AiStudySourcePagePreview({ pageNumber, projectId, sourceId }: {
  pageNumber: number;
  projectId: string;
  sourceId: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileUrl = `/api/ai-study/projects/${encodeURIComponent(projectId)}/sources/${encodeURIComponent(sourceId)}/file`;

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    let destroyDocument: (() => void) | null = null;
    let cancelRender: (() => void) | null = null;
    const controller = new AbortController();

    async function renderPage() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(fileUrl, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("原始 PDF 加载失败，请稍后重试。");
        const data = new Uint8Array(await response.arrayBuffer());
        if (!active) return;

        const pdfjs = await import("pdfjs-dist");
        if (!active) return;
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
        const task = pdfjs.getDocument({
          data,
          cMapUrl: "/pdfjs/cmaps/",
          cMapPacked: true,
          standardFontDataUrl: "/pdfjs/standard_fonts/",
          wasmUrl: "/pdfjs/wasm/",
          iccUrl: "/pdfjs/iccs/"
        });
        destroyDocument = () => { void task.destroy(); };
        const pdf = await task.promise;
        if (!active) return;
        if (pageNumber < 1 || pageNumber > pdf.numPages) {
          throw new Error("原文页码超出 PDF 范围。");
        }
        const page = await pdf.getPage(pageNumber);
        if (!active || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("浏览器无法显示 PDF 页面。");
        const baseViewport = page.getViewport({ scale: 1 });
        const availableWidth = Math.max(240, window.innerWidth - 64);
        const displayScale = Math.min(1.5, availableWidth / baseViewport.width);
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({ scale: displayScale * pixelRatio });
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        canvas.style.width = `${Math.ceil(viewport.width / pixelRatio)}px`;
        canvas.style.height = `${Math.ceil(viewport.height / pixelRatio)}px`;
        const renderTask = page.render({ canvas, canvasContext: context, viewport });
        cancelRender = () => renderTask.cancel();
        await renderTask.promise;
        if (active) setLoading(false);
      } catch (caught) {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : "原文页面加载失败。");
        setLoading(false);
      }
    }

    void renderPage();
    return () => {
      active = false;
      controller.abort();
      cancelRender?.();
      destroyDocument?.();
    };
  }, [fileUrl, open, pageNumber]);

  return (
    <>
      <button
        className="my-2 rounded-md bg-[#0e8528] px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#0b6f22] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0e8528]"
        onClick={() => setOpen(true)}
        type="button"
      >
        查看原页
      </button>
      {open ? createPortal(
        <div
          aria-label={`第${pageNumber}页原文`}
          aria-modal="true"
          className="fixed inset-0 z-[100] flex flex-col bg-black/80 p-3 md:p-6"
          onClick={() => setOpen(false)}
          role="dialog"
        >
          <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between gap-3 rounded-t-xl bg-white px-4 py-3" onClick={(event) => event.stopPropagation()}>
            <h2 className="text-sm font-bold text-[#111827]">原文第 {pageNumber} 页</h2>
            <div className="flex items-center gap-2">
              <a
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-[#475467] hover:bg-[#f2f4f7]"
                href={`${fileUrl}#page=${pageNumber}`}
                rel="noopener noreferrer"
                target="_blank"
              >
                打开 PDF <ExternalLink size={13} />
              </a>
              <button
                aria-label="关闭原文页面"
                autoFocus
                className="grid size-8 place-items-center rounded-md text-[#344054] hover:bg-[#f2f4f7]"
                onClick={() => setOpen(false)}
                type="button"
              >
                <X size={18} />
              </button>
            </div>
          </div>
          <div className="mx-auto min-h-0 w-full max-w-[1200px] flex-1 overflow-auto rounded-b-xl bg-[#e8ebef] p-3 text-center" onClick={(event) => event.stopPropagation()}>
            {loading ? <div className="flex items-center justify-center gap-2 py-8 text-sm text-[#475467]"><Loader2 className="animate-spin" size={16} />正在加载原文页面…</div> : null}
            {error ? <p className="py-8 text-sm text-[#b42318]">{error}</p> : null}
            <canvas aria-label={`PDF 第${pageNumber}页`} className={loading || error ? "hidden" : "mx-auto bg-white shadow-lg"} ref={canvasRef} role="img" />
          </div>
        </div>,
        document.body
      ) : null}
    </>
  );
}
