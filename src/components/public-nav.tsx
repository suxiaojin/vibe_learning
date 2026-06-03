"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpenCheck } from "lucide-react";

const hiddenNavPrefixes = [
  "/login",
  "/register",
  "/user-agreement",
  "/privacy-policy",
  "/platform-agreement"
];

export function PublicNav() {
  const pathname = usePathname();
  const hidden = hiddenNavPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

  if (hidden) {
    return null;
  }

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/learn" className="flex items-center gap-2 font-semibold text-ink">
          <span className="grid size-9 place-items-center rounded-xl bg-teal text-white">
            <BookOpenCheck size={20} />
          </span>
          Vibe Learning
        </Link>
        <nav className="flex items-center gap-2 text-sm">
          <Link className="primary-button" href="/login">登录</Link>
        </nav>
      </div>
    </header>
  );
}
