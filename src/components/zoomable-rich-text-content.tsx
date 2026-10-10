"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

type ZoomedImage = { src: string; alt: string };

const richTextHtmlPattern = /<\/?[a-z][\s\S]*>/i;

export function ZoomableRichTextContent({ className, inline = false, value }: { className?: string; inline?: boolean; value: string }) {
  const [zoomedImage, setZoomedImage] = useState<ZoomedImage | null>(null);

  useEffect(() => {
    if (!zoomedImage) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setZoomedImage(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [zoomedImage]);

  const handleImageClick = (event: MouseEvent<HTMLElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLImageElement)) return;
    event.preventDefault();
    event.stopPropagation();
    setZoomedImage({ src: target.currentSrc || target.src, alt: target.alt });
  };

  const content = !richTextHtmlPattern.test(value) ? (
    inline ? (
      <span className={cn("whitespace-pre-wrap break-words", className)}>{value}</span>
    ) : (
      <p className={cn("whitespace-pre-wrap break-words", className)}>{value}</p>
    )
  ) : inline ? (
    <span
      className={cn("break-words [&_img]:inline-block [&_img]:h-auto [&_img]:max-w-full [&_img]:cursor-zoom-in", className)}
      dangerouslySetInnerHTML={{ __html: value }}
      onClick={handleImageClick}
    />
  ) : (
    <div
      className={cn(
        "overflow-x-auto break-words [&_div]:my-1 [&_img]:my-2 [&_img]:h-auto [&_img]:max-w-full [&_img]:cursor-zoom-in [&_li]:my-0.5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1 [&_table]:my-2 [&_table]:max-w-full [&_table]:border-collapse [&_td]:border [&_td]:border-current [&_td]:p-2 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5",
        className
      )}
      dangerouslySetInnerHTML={{ __html: value }}
      onClick={handleImageClick}
    />
  );

  return (
    <>
      {content}
      {zoomedImage ? createPortal(
        <div
          aria-label={zoomedImage.alt || "Image preview"}
          aria-modal="true"
          className="fixed inset-0 z-[100] grid cursor-zoom-out place-items-center bg-black/85 p-4"
          role="dialog"
          onClick={() => setZoomedImage(null)}
        >
          <button
            aria-label="Close image preview"
            className="absolute right-4 top-4 z-10 grid size-11 place-items-center rounded-full bg-white/15 text-3xl leading-none text-white transition hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            type="button"
            onClick={() => setZoomedImage(null)}
          >
            ×
          </button>
          <img
            alt={zoomedImage.alt}
            className="max-h-[90vh] max-w-[95vw] cursor-default object-contain shadow-2xl"
            decoding="async"
            src={zoomedImage.src}
            onClick={(event) => event.stopPropagation()}
          />
        </div>,
        document.body
      ) : null}
    </>
  );
}
