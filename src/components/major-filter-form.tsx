"use client";

import type { FormEvent, ReactNode } from "react";

export function MajorFilterForm({ children, className }: { children: ReactNode; className: string }) {
  function saveFilters(event: FormEvent<HTMLFormElement>) {
    const data = new FormData(event.currentTarget);
    const regionId = String(data.get("regionId") || "");
    const status = String(data.get("status") || "");
    const attributes = "Path=/admin/majors; Max-Age=31536000; SameSite=Lax";
    document.cookie = `adminMajorsRegionId=${encodeURIComponent(regionId)}; ${attributes}`;
    document.cookie = `adminMajorsStatus=${encodeURIComponent(status)}; ${attributes}`;
  }

  return <form action="/admin/majors" className={className} onSubmit={saveFilters}>{children}</form>;
}
