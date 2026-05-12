"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";

const text = {
  title: "\u8bfe\u524d\u63d0\u793a",
  previous: "\u4e0a\u4e00\u6761\u8bfe\u524d\u63d0\u793a",
  next: "\u4e0b\u4e00\u6761\u8bfe\u524d\u63d0\u793a",
  view: "\u67e5\u770b\u7b2c",
  suffix: "\u6761\u8bfe\u524d\u63d0\u793a",
  fallback: "\u6682\u65f6\u6ca1\u6709\u8bfe\u524d\u63d0\u793a\uff0c\u53ef\u4ee5\u76f4\u63a5\u5f00\u59cb\u7ec3\u4e60\u3002"
};

export function LessonHintCarousel({ content }: { content: string | null }) {
  const slides = useMemo(() => splitHints(content), [content]);
  const [index, setIndex] = useState(0);
  const current = slides[index] || text.fallback;

  function previous() {
    setIndex((value) => (value === 0 ? slides.length - 1 : value - 1));
  }

  function next() {
    setIndex((value) => (value + 1) % slides.length);
  }

  return (
    <section className="rounded-2xl bg-mist p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-black text-teal">
          <span className="grid size-8 place-items-center rounded-xl bg-teal/10">
            <Lightbulb size={18} />
          </span>
          <span>{text.title}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="grid size-8 place-items-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-teal hover:text-teal disabled:opacity-40"
            type="button"
            onClick={previous}
            disabled={slides.length <= 1}
            aria-label={text.previous}
          >
            <ChevronLeft size={18} />
          </button>
          <span className="min-w-12 text-center text-xs font-black text-slate-400">{index + 1}/{slides.length}</span>
          <button
            className="grid size-8 place-items-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-teal hover:text-teal disabled:opacity-40"
            type="button"
            onClick={next}
            disabled={slides.length <= 1}
            aria-label={text.next}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
      <p className="mt-3 line-clamp-3 min-h-20 text-sm leading-7 text-slate-700">{current}</p>
      <div className="mt-3 flex gap-1.5">
        {slides.map((_, slideIndex) => (
          <button
            key={slideIndex}
            className={cn("h-2 rounded-full transition", slideIndex === index ? "w-8 bg-[#58cc02]" : "w-2 bg-slate-300")}
            type="button"
            onClick={() => setIndex(slideIndex)}
            aria-label={`${text.view} ${slideIndex + 1} ${text.suffix}`}
          />
        ))}
      </div>
    </section>
  );
}

function splitHints(content: string | null) {
  const source = (content || "").replace(/\r\n/g, "\n").trim();
  if (!source) {
    return [text.fallback];
  }

  const paragraphs = source
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);

  return paragraphs.length > 0 ? paragraphs : [text.fallback];
}
