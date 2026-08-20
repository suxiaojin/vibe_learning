"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export function CollapsiblePostText({
  compact = false,
  content
}: {
  compact?: boolean;
  content: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const paragraphRef = useRef<HTMLParagraphElement>(null);
  const restoreAfterCollapseRef = useRef(false);
  const paragraphId = useId();

  useEffect(() => {
    setExpanded(false);
  }, [content]);

  useEffect(() => {
    if (expanded) {
      return;
    }
    const paragraph = paragraphRef.current;
    if (!paragraph) {
      return;
    }

    const measureOverflow = () => {
      setHasOverflow(paragraph.scrollHeight - paragraph.clientHeight > 1);
    };
    const frameId = window.requestAnimationFrame(measureOverflow);
    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(measureOverflow);
    resizeObserver?.observe(paragraph);

    return () => {
      window.cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
    };
  }, [content, expanded]);

  useEffect(() => {
    if (!expanded && restoreAfterCollapseRef.current) {
      restoreAfterCollapseRef.current = false;
      containerRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [expanded]);

  function toggleExpanded() {
    if (expanded) {
      restoreAfterCollapseRef.current = true;
    }
    setExpanded((current) => !current);
  }

  const expandLabel = compact ? "展开原文" : "阅读全文";
  const collapseLabel = compact ? "收起原文" : "收起";

  return (
    <div ref={containerRef}>
      <p
        className={cn(
          "whitespace-pre-wrap break-words font-medium leading-7 text-ink/85",
          compact ? "text-sm" : "text-[15px]",
          !expanded && (compact ? "line-clamp-3" : "line-clamp-5 sm:line-clamp-4")
        )}
        id={paragraphId}
        ref={paragraphRef}
      >
        {content}
      </p>
      {hasOverflow ? (
        <button
          aria-controls={paragraphId}
          aria-expanded={expanded}
          className="-ml-2 mt-0.5 inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-teal transition-colors hover:bg-teal/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/30"
          onClick={toggleExpanded}
          type="button"
        >
          {expanded ? collapseLabel : expandLabel}
          {expanded ? <ChevronUp aria-hidden="true" size={15} /> : <ChevronDown aria-hidden="true" size={15} />}
        </button>
      ) : null}
    </div>
  );
}
