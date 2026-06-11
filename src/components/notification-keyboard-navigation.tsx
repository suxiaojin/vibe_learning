"use client";

import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export function NotificationKeyboardNavigation({ children, disabled = false }: { children: ReactNode; disabled?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (disabled) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
        return;
      }
      const target = event.target;
      if (target instanceof HTMLElement) {
        if (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName)) {
          return;
        }
        if (target.closest("a") && !containerRef.current?.contains(target)) {
          return;
        }
      }

      const links = Array.from(
        containerRef.current?.querySelectorAll<HTMLAnchorElement>("a[data-notification-item]") || []
      );
      if (links.length === 0) {
        return;
      }

      const focusedIndex = links.findIndex((link) => link === document.activeElement);
      const selectedIndex = links.findIndex((link) => link.dataset.selected === "true");
      const currentIndex = focusedIndex >= 0 ? focusedIndex : selectedIndex;
      const nextIndex = currentIndex < 0
        ? event.key === "ArrowDown" ? 0 : links.length - 1
        : Math.max(0, Math.min(links.length - 1, currentIndex + (event.key === "ArrowDown" ? 1 : -1)));

      if (nextIndex === currentIndex) {
        return;
      }
      const nextLink = links[nextIndex];
      const href = nextLink.getAttribute("href");
      if (!href) {
        return;
      }

      event.preventDefault();
      nextLink.focus({ preventScroll: true });
      nextLink.scrollIntoView({ block: "nearest" });
      router.push(href);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [disabled, router]);

  return <div className="min-h-0 flex-1" ref={containerRef}>{children}</div>;
}
