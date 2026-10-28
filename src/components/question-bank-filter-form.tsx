"use client";

import type { FormEvent, ReactNode } from "react";

export function QuestionBankFilterForm({ children, className }: { children: ReactNode; className: string }) {
  function saveFilters(event: FormEvent<HTMLFormElement>) {
    const data = new FormData(event.currentTarget);
    const province = String(data.get("province") || "");
    const examType = String(data.get("examType") || "");
    const attributes = "Path=/admin/question-banks; Max-Age=31536000; SameSite=Lax";
    document.cookie = `adminQuestionBanksProvince=${encodeURIComponent(province)}; ${attributes}`;
    document.cookie = `adminQuestionBanksExamType=${encodeURIComponent(examType)}; ${attributes}`;
  }

  return <form action="/admin/question-banks" className={className} onSubmit={saveFilters}>{children}</form>;
}
