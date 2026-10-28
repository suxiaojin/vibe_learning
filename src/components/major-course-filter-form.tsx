"use client";

import type { FormEvent, MouseEvent, ReactNode } from "react";

export function MajorCourseFilterForm({ majorId, children, className }: { majorId: string; children: ReactNode; className: string }) {
  const path = `/admin/majors/${encodeURIComponent(majorId)}/courses`;

  function saveFilters(event: FormEvent<HTMLFormElement>) {
    const data = new FormData(event.currentTarget);
    const attributes = `Path=${path}; Max-Age=31536000; SameSite=Lax`;
    document.cookie = `adminMajorCoursesRegionId=${encodeURIComponent(String(data.get("regionId") || ""))}; ${attributes}`;
    document.cookie = `adminMajorCoursesStatus=${encodeURIComponent(String(data.get("status") || ""))}; ${attributes}`;
  }

  function resetFilters(event: MouseEvent<HTMLButtonElement>) {
    const form = event.currentTarget.form;
    if (!form) return;
    const region = form.elements.namedItem("regionId");
    const status = form.elements.namedItem("status");
    if (region instanceof HTMLSelectElement) region.value = "";
    if (status instanceof HTMLSelectElement) status.value = "";
  }

  return (
    <form action={path} className={className} onSubmit={saveFilters}>
      {children}
      <button className="secondary-button h-10 rounded-none px-4" type="submit" onClick={resetFilters}>重置</button>
    </form>
  );
}
