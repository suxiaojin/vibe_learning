"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export function DismissibleDetails({
  children,
  className,
  group
}: {
  children: ReactNode;
  className?: string;
  group?: string;
}) {
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const details = detailsRef.current;
    if (!details || !open) {
      return;
    }

    if (group) {
      document.querySelectorAll<HTMLDetailsElement>("details[data-details-group]").forEach((item) => {
        if (item !== details && item.dataset.detailsGroup === group) {
          item.open = false;
        }
      });
    }

    function close() {
      if (details) {
        details.open = false;
      }
      setOpen(false);
    }

    function onPointerDown(event: PointerEvent) {
      if (details && event.target instanceof Node && !details.contains(event.target)) {
        close();
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        close();
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [group, open]);

  return (
    <details
      ref={detailsRef}
      className={className}
      data-details-group={group}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      {children}
    </details>
  );
}
