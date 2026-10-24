"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";

type StudyPart = {
  id: string;
  title: string;
  partIndex: number | null;
  partCount: number | null;
};

export function StudyPartPicker({ canonicalId, currentId, parts, resume, storageKey }: {
  canonicalId: string;
  currentId: string;
  parts: StudyPart[];
  resume: boolean;
  storageKey: string;
}) {
  const router = useRouter();
  const current = parts.find((part) => part.id === currentId);
  const count = Math.max(parts.length, ...parts.map((part) => part.partCount || 1));

  useEffect(() => {
    try {
      const savedId = window.localStorage.getItem(storageKey);
      if (resume && currentId === canonicalId && savedId && savedId !== currentId && parts.some((part) => part.id === savedId)) {
        router.replace(`/study-buddy/${savedId}`);
        return;
      }
      window.localStorage.setItem(storageKey, currentId);
    } catch {
      // The picker still works when browser storage is unavailable.
    }
  }, [canonicalId, currentId, parts, resume, router, storageKey]);

  function rememberPart(partId: string) {
    try {
      window.localStorage.setItem(storageKey, partId);
    } catch {
      // Navigation does not depend on browser storage.
    }
  }

  return (
    <details className="group relative shrink-0">
      <summary className="flex cursor-pointer list-none items-center gap-1 rounded-lg border border-[#dce5e0] bg-white px-2.5 py-1.5 text-xs font-bold text-[#344054] [&::-webkit-details-marker]:hidden">
        第 {current?.partIndex || 1}/{count} 部分
        <ChevronDown className="transition-transform group-open:rotate-180" size={14} />
      </summary>
      <nav aria-label="切换学习部分" className="absolute left-0 top-full z-40 mt-2 max-h-72 w-44 overflow-y-auto rounded-xl border border-[#e4e8ee] bg-white p-1.5 shadow-lg">
        {parts.map((part, index) => (
          <Link
            aria-current={part.id === currentId ? "page" : undefined}
            className={`block rounded-lg px-3 py-2 text-sm font-semibold hover:bg-[#f2f8f4] ${part.id === currentId ? "bg-[#e8f7ee] text-[#0e8528]" : "text-[#344054]"}`}
            href={`/study-buddy/${part.id}?selectPart=1`}
            key={part.id}
            onClick={() => rememberPart(part.id)}
            title={part.title}
          >
            第 {part.partIndex || index + 1} 部分
          </Link>
        ))}
      </nav>
    </details>
  );
}
