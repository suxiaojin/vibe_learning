"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";

export function PdfFullscreenViewer({ src, title }: { src: string; title: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    function syncFullscreenState() {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    }
    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () => document.removeEventListener("fullscreenchange", syncFullscreenState);
  }, []);

  async function toggleFullscreen() {
    setError("");
    try {
      if (document.fullscreenElement === containerRef.current) {
        await document.exitFullscreen();
        return;
      }
      await containerRef.current?.requestFullscreen();
    } catch {
      setError("当前浏览器无法进入全屏，请检查浏览器权限设置。");
    }
  }

  return (
    <div ref={containerRef} className="bg-[#202124]">
      <div className="flex h-11 items-center justify-end gap-3 border-b border-white/10 px-3 text-white">
        {error ? <span className="mr-auto text-xs text-red-200">{error}</span> : null}
        <button
          className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-bold text-white transition hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          onClick={toggleFullscreen}
          type="button"
        >
          {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          {isFullscreen ? "退出全屏" : "全屏"}
        </button>
      </div>
      <iframe
        className={`w-full bg-white ${isFullscreen ? "h-[calc(100vh-44px)] min-h-0" : "h-[calc(100dvh-294px)] min-h-[636px]"}`}
        src={src}
        title={title}
      />
    </div>
  );
}
