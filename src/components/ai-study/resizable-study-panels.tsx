"use client";

import { type CSSProperties, type PointerEvent, type ReactNode, useRef, useState } from "react";

type ResizableStudyPanelsProps = {
  left: ReactNode;
  children: ReactNode;
};

export function ResizableStudyPanels({ left, children }: ResizableStudyPanelsProps) {
  const [leftPercent, setLeftPercent] = useState(49);
  const containerRef = useRef<HTMLDivElement>(null);

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
    setLeftPercent(Math.max(34, Math.min(68, next)));
  }

  return (
    <section
      ref={containerRef}
      className="mx-auto grid max-w-[1780px] grid-cols-1 gap-4 px-5 py-4 md:px-7 xl:grid-cols-[var(--study-left)_12px_minmax(420px,1fr)] xl:gap-0"
      style={{
        "--study-left": `minmax(360px, ${leftPercent}%)`
      } as CSSProperties}
    >
      <div className="min-w-0">{left}</div>
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
      <div className="min-w-0">{children}</div>
    </section>
  );
}
