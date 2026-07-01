"use client";

import { cloneElement, isValidElement, type CSSProperties, type PointerEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { PanelLeftOpen } from "lucide-react";

type ResizableStudyPanelsProps = {
  left: ReactNode;
  children: ReactNode;
};

const panelPreferenceKey = "vibe-ai-study-panel-preferences:v1";
const defaultLeftPercent = 49;
const minLeftPercent = 34;
const maxLeftPercent = 68;

export function ResizableStudyPanels({ left, children }: ResizableStudyPanelsProps) {
  const [leftPercent, setLeftPercent] = useState(defaultLeftPercent);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(panelPreferenceKey);
      if (saved) {
        const parsed = JSON.parse(saved) as { isSidebarCollapsed?: unknown; leftPercent?: unknown };
        const nextLeftPercent = typeof parsed.leftPercent === "number" ? parsed.leftPercent : defaultLeftPercent;
        setLeftPercent(clampLeftPercent(nextLeftPercent));
        setIsSidebarCollapsed(parsed.isSidebarCollapsed === true);
      }
    } catch {
      // Ignore unavailable or malformed localStorage preferences.
    } finally {
      setPreferencesReady(true);
    }
  }, []);

  useEffect(() => {
    if (!preferencesReady) {
      return;
    }
    try {
      window.localStorage.setItem(panelPreferenceKey, JSON.stringify({ isSidebarCollapsed, leftPercent }));
    } catch {
      // Preference persistence is best-effort only.
    }
  }, [isSidebarCollapsed, leftPercent, preferencesReady]);

  function handlePointerDown(event: PointerEvent<HTMLButtonElement>) {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLButtonElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      return;
    }
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const rect = container.getBoundingClientRect();
    const next = ((event.clientX - rect.left) / rect.width) * 100;
    setLeftPercent(clampLeftPercent(next));
  }

  function renderLeftPanel() {
    if (isValidElement<{ onCollapseSidebar?: () => void }>(left)) {
      return cloneElement(left, { onCollapseSidebar: () => setIsSidebarCollapsed(true) });
    }
    return left;
  }

  return (
    <section
      ref={containerRef}
      className={`mx-auto grid max-w-[1780px] grid-cols-1 gap-4 px-5 py-4 md:px-7 ${
        isSidebarCollapsed
          ? "xl:grid-cols-[48px_minmax(420px,1fr)] xl:gap-3"
          : "xl:grid-cols-[var(--study-left)_12px_minmax(420px,1fr)] xl:gap-0"
      }`}
      style={{
        "--study-left": `minmax(360px, ${leftPercent}%)`
      } as CSSProperties}
    >
      {isSidebarCollapsed ? (
        <div className="flex min-h-12 items-center rounded-[16px] bg-white px-3 shadow-[0_12px_32px_rgba(16,24,40,0.05)] xl:min-h-[calc(100dvh-112px)] xl:items-start xl:justify-center xl:px-0 xl:py-3">
          <button
            aria-label="展开知识框架侧栏"
            className="group relative grid size-9 place-items-center rounded-[10px] text-[#344054] transition hover:bg-[#f4f6f8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#16a329]"
            onClick={() => setIsSidebarCollapsed(false)}
            title="展开侧栏"
            type="button"
          >
            <PanelLeftOpen size={18} />
            <span className="pointer-events-none absolute left-11 top-1/2 z-30 hidden -translate-y-1/2 whitespace-nowrap rounded-[7px] bg-[#111827] px-3 py-2 text-xs font-black text-white shadow-lg group-hover:block">
              展开侧栏
            </span>
          </button>
        </div>
      ) : (
        <div className="min-w-0">{renderLeftPanel()}</div>
      )}
      {!isSidebarCollapsed ? (
        <button
          aria-label="拖动调整知识框架和知识卡片宽度"
          className="group relative mx-1 hidden cursor-col-resize items-stretch justify-center xl:flex"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          type="button"
        >
          <span className="my-3 w-px rounded-full bg-[#dde3ea] transition group-hover:bg-[#98a2b3]" />
          <span className="absolute left-1/2 top-1/2 h-12 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-transparent transition group-hover:bg-[#d7dde6]" />
        </button>
      ) : null}
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function clampLeftPercent(value: number) {
  return Math.max(minLeftPercent, Math.min(maxLeftPercent, Number(value.toFixed(2))));
}
