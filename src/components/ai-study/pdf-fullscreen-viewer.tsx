"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight, ListTree, Maximize2, Minimize2, Minus, Plus } from "lucide-react";

type PdfOutlineItem = {
  title: string;
  dest: string | unknown[] | null;
  items: PdfOutlineItem[];
};

type OutlineLinkService = {
  goToDestination(dest: string | unknown[]): Promise<void>;
};

function OutlineEntry({
  item,
  onNavigate
}: {
  item: PdfOutlineItem;
  onNavigate: (dest: string | unknown[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = item.items.length > 0;

  return (
    <li>
      <div className="flex items-start gap-1 rounded px-1 py-0.5 hover:bg-white/10">
        {hasChildren ? (
          <button
            type="button"
            className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded hover:bg-white/15"
            aria-label={expanded ? `收起${item.title}` : `展开${item.title}`}
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            <ChevronRight size={14} className={expanded ? "rotate-90" : ""} />
          </button>
        ) : <span className="size-5 shrink-0" />}
        {item.dest ? (
          <button
            type="button"
            className="min-w-0 flex-1 py-0.5 text-left text-xs leading-5 text-white/90 hover:text-white"
            onClick={() => onNavigate(item.dest!)}
          >
            {item.title}
          </button>
        ) : (
          <span className="min-w-0 flex-1 py-0.5 text-xs leading-5 text-white/70">{item.title}</span>
        )}
      </div>
      {hasChildren && expanded ? (
        <ul className="ml-3 border-l border-white/15 pl-1">
          {item.items.map((child, index) => (
            <OutlineEntry key={`${index}-${child.title}`} item={child} onNavigate={onNavigate} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function PdfFullscreenViewer({
  src,
  title,
  progressEndpoint
}: {
  src: string;
  title: string;
  progressEndpoint?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const pdfViewerRef = useRef<{ currentPageNumber: number; currentScale: number; pagesCount: number } | null>(null);
  const linkServiceRef = useRef<OutlineLinkService | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentPageRef = useRef(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1);
  const [error, setError] = useState("");
  const [outline, setOutline] = useState<PdfOutlineItem[] | null>(null);
  const [outlineOpen, setOutlineOpen] = useState(false);

  useEffect(() => {
    function syncFullscreen() {
      setFullscreen(document.fullscreenElement === rootRef.current);
    }
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  useEffect(() => {
    let active = true;
    let restoring = true;
    let pdfTask: { destroy(): Promise<void> } | null = null;
    let pageChanging: ((event: { pageNumber?: number }) => void) | null = null;
    let eventBus: { on(name: string, listener: (event: { pageNumber?: number }) => void): void; off(name: string, listener: (event: { pageNumber?: number }) => void): void } | null = null;
    setOutline(null);
    setOutlineOpen(false);

    async function save(pageNumber: number, keepalive = false) {
      if (!progressEndpoint) return;
      try {
        const response = await fetch(progressEndpoint, {
          method: "PUT",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          keepalive,
          body: JSON.stringify({ pageNumber })
        });
        if (!response.ok) throw new Error("save failed");
      } catch (saveError) {
        console.warn("[PdfFullscreenViewer] Reading progress save failed", saveError);
      }
    }

    async function load() {
      try {
        let savedPage = 1;
        if (progressEndpoint) {
          try {
            const response = await fetch(progressEndpoint, { cache: "no-store", credentials: "same-origin" });
            if (response.ok) {
              const payload = await response.json();
              if (Number.isSafeInteger(payload?.data?.pageNumber) && payload.data.pageNumber > 0) {
                savedPage = payload.data.pageNumber;
              }
            } else {
              console.warn("[PdfFullscreenViewer] Reading progress load failed", response.status);
            }
          } catch (progressError) {
            console.warn("[PdfFullscreenViewer] Reading progress load failed", progressError);
          }
        }

        const pdfjs = await import("pdfjs-dist");
        // pdf_viewer.mjs reads the core API from globalThis while it loads.
        (globalThis as typeof globalThis & { pdfjsLib?: typeof pdfjs }).pdfjsLib = pdfjs;
        const viewerModule = await import("pdfjs-dist/web/pdf_viewer.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
        const task = pdfjs.getDocument({
          url: src,
          cMapUrl: "/pdfjs/cmaps/",
          cMapPacked: true,
          standardFontDataUrl: "/pdfjs/standard_fonts/",
          wasmUrl: "/pdfjs/wasm/",
          iccUrl: "/pdfjs/iccs/"
        });
        pdfTask = task;
        const documentProxy = await task.promise;
        if (!active || !scrollRef.current || !viewerRef.current) {
          await task.destroy();
          return;
        }

        const bus = new viewerModule.EventBus();
        const linkService = new viewerModule.PDFLinkService({ eventBus: bus });
        const pdfViewer = new viewerModule.PDFViewer({
          container: scrollRef.current,
          viewer: viewerRef.current,
          eventBus: bus,
          linkService,
          imageResourcesPath: "/pdfjs/images/"
        });
        linkService.setViewer(pdfViewer);
        linkServiceRef.current = linkService;
        eventBus = bus;
        pdfViewerRef.current = pdfViewer;

        pageChanging = (event) => {
          const pageNumber = event.pageNumber;
          if (!pageNumber) return;
          currentPageRef.current = pageNumber;
          setPage(pageNumber);
          setPageInput(String(pageNumber));
          if (!progressEndpoint || restoring) return;
          if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
          saveTimerRef.current = setTimeout(() => void save(pageNumber), 450);
        };
        bus.on("pagechanging", pageChanging);
        bus.on("pagesinit", () => {
          if (!active) return;
          setTotalPages(pdfViewer.pagesCount);
          const initialPage = Math.min(Math.max(savedPage, 1), pdfViewer.pagesCount || 1);
          pdfViewer.currentPageNumber = initialPage;
          currentPageRef.current = initialPage;
          setPage(initialPage);
          setPageInput(String(initialPage));
          window.setTimeout(() => { restoring = false; }, 0);
        });

        pdfViewer.setDocument(documentProxy);
        linkService.setDocument(documentProxy);
        void documentProxy.getOutline().then((items) => {
          if (!active) return;
          const entries = items ?? [];
          setOutline(entries);
          if (entries.length) setOutlineOpen(true);
        }).catch((outlineError) => {
          console.warn("[PdfFullscreenViewer] PDF outline unavailable", outlineError);
          if (active) setOutline([]);
        });
      } catch (loadError) {
        console.error("[PdfFullscreenViewer] PDF initialization failed", loadError);
        if (active) setError("PDF 加载失败，请刷新页面后重试。");
      }
    }

    void load();

    function flush() {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (!restoring) void save(currentPageRef.current, true);
    }
    function onVisibilityChange() {
      if (document.visibilityState === "hidden") flush();
    }
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      active = false;
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (eventBus && pageChanging) eventBus.off("pagechanging", pageChanging);
      pdfViewerRef.current = null;
      linkServiceRef.current = null;
      if (pdfTask) void pdfTask.destroy();
    };
  }, [src, progressEndpoint]);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement === rootRef.current) await document.exitFullscreen();
      else await rootRef.current?.requestFullscreen();
    } catch {
      setError("当前浏览器无法进入全屏，请检查浏览器权限设置。");
    }
  }

  function goToPage(value: string) {
    const requested = Number.parseInt(value, 10);
    if (!Number.isFinite(requested) || totalPages < 1) {
      setPageInput(String(page));
      return;
    }
    const next = Math.min(Math.max(requested, 1), totalPages);
    setPageInput(String(next));
    if (pdfViewerRef.current) pdfViewerRef.current.currentPageNumber = next;
  }

  function goToOutlineDestination(dest: string | unknown[]) {
    const service = linkServiceRef.current;
    if (!service) return;
    void service.goToDestination(dest).catch((navigationError) => {
      console.error("[PdfFullscreenViewer] PDF outline navigation failed", navigationError);
    });
    if (window.innerWidth < 768) setOutlineOpen(false);
  }

  function changeZoom(delta: number) {
    const viewer = pdfViewerRef.current;
    if (!viewer) return;
    const next = Math.min(Math.max(viewer.currentScale + delta, 0.25), 4);
    viewer.currentScale = next;
    setScale(next);
  }

  return (
    <div ref={rootRef} className="bg-[#202124]">
      <div className="flex h-11 items-center gap-2 border-b border-white/10 px-3 text-white">
        <button
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-white/15"
          type="button"
          aria-label={outlineOpen ? "关闭 PDF 目录" : "打开 PDF 目录"}
          aria-controls="pdf-outline-sidebar"
          aria-expanded={outlineOpen}
          title={outlineOpen ? "关闭目录" : "打开目录"}
          onClick={() => setOutlineOpen(!outlineOpen)}
        ><ListTree size={17} /></button>
        <span className="min-w-0 flex-1 truncate text-xs font-semibold">{title}</span>
        <button className="inline-flex size-8 items-center justify-center rounded-md hover:bg-white/15" type="button" aria-label="缩小" title="缩小" onClick={() => changeZoom(-0.1)}><Minus size={16} /></button>
        <span className="min-w-12 text-center text-xs">{totalPages ? String(Math.round(scale * 100)) + "%" : "—"}</span>
        <button className="inline-flex size-8 items-center justify-center rounded-md hover:bg-white/15" type="button" aria-label="放大" title="放大" onClick={() => changeZoom(0.1)}><Plus size={16} /></button>
        <div className="mx-1 h-6 w-px bg-white/20" />
        <button className="inline-flex size-8 items-center justify-center rounded-md hover:bg-white/15 disabled:opacity-40" type="button" aria-label="上一页" title="上一页" onClick={() => goToPage(String(page - 1))} disabled={page <= 1}>−</button>
        <input
          className="h-7 w-12 rounded border border-white/15 bg-[#151515] px-1 text-center text-xs text-white outline-none focus:border-blue-400"
          aria-label="当前页码"
          inputMode="numeric"
          value={pageInput}
          onChange={(event) => setPageInput(event.target.value)}
          onBlur={() => goToPage(pageInput)}
          onKeyDown={(event) => { if (event.key === "Enter") goToPage(pageInput); }}
          disabled={!totalPages}
        />
        <span className="whitespace-nowrap text-xs text-white/80">/ {totalPages || "—"}</span>
        <button className="inline-flex size-8 items-center justify-center rounded-md hover:bg-white/15 disabled:opacity-40" type="button" aria-label="下一页" title="下一页" onClick={() => goToPage(String(page + 1))} disabled={page >= totalPages}>+</button>
        <button className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-bold hover:bg-white/15" onClick={toggleFullscreen} type="button">
          {fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          {fullscreen ? "退出全屏" : "全屏"}
        </button>
      </div>
      <div
        className="relative flex"
        style={{ height: fullscreen ? "calc(100vh - 44px)" : "calc(100dvh - 294px)", minHeight: fullscreen ? 0 : 636 }}
      >
        {outlineOpen ? (
          <aside
            id="pdf-outline-sidebar"
            aria-label="PDF 目录"
            className="absolute inset-y-0 left-0 z-10 w-72 max-w-[80vw] shrink-0 overflow-y-auto border-r border-white/15 bg-[#262626] p-3 text-white md:relative md:z-auto"
          >
            <div className="mb-3 text-xs font-semibold text-white/70">目录</div>
            {outline === null ? <p className="text-xs text-white/60">正在读取目录…</p> : null}
            {outline?.length === 0 ? <p className="text-xs text-white/60">此 PDF 未包含目录书签。</p> : null}
            {outline?.length ? (
              <ul>
                {outline.map((item, index) => (
                  <OutlineEntry key={`${index}-${item.title}`} item={item} onNavigate={goToOutlineDestination} />
                ))}
              </ul>
            ) : null}
          </aside>
        ) : null}
        <div className="relative min-w-0 flex-1">
          <div ref={scrollRef} className="pdfjs-scroll absolute inset-0 overflow-auto bg-[#323232]">
            <div ref={viewerRef} className="pdfViewer" />
            {error ? <div className="grid min-h-32 place-items-center px-6 text-center text-sm text-red-200">{error}</div> : null}
            {!error && !totalPages ? <div className="grid min-h-32 place-items-center text-sm text-white/70">正在加载 PDF…</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
