"use client";

import { useLayoutEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { getStudentLearningFontFamilyCss, getStudentLearningFontSizePixels } from "@/lib/student-learning-typography";

export function StudentLearningTypographyScope({
  children,
  fontFamily,
  fontSize
}: {
  children: ReactNode;
  fontFamily: string;
  fontSize: string;
}) {
  const pathname = usePathname();

  useLayoutEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const previousFontSize = root.style.fontSize;
    const previousFontFamily = body.style.fontFamily;
    const isStudentPage = pathname !== null && !pathname.startsWith("/admin") && !pathname.startsWith("/api");

    if (isStudentPage) {
      root.style.fontSize = `${getStudentLearningFontSizePixels(fontSize)}px`;
      body.style.fontFamily = getStudentLearningFontFamilyCss(fontFamily);
    }

    return () => {
      root.style.fontSize = previousFontSize;
      body.style.fontFamily = previousFontFamily;
    };
  }, [fontFamily, fontSize, pathname]);

  return children;
}
