import type { Metadata } from "next";
import { Nav } from "@/components/nav";
import { PostSuccessToast } from "@/components/post-success-toast";
import { StudentLearningTypographyScope } from "@/components/student-learning-typography-scope";
import { getSystemSettings } from "@/lib/system-settings";
import "katex/dist/katex.min.css";
import "pdfjs-dist/web/pdf_viewer.css";
import "./globals.css";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSystemSettings(["browserTabTitle", "browserTabIconUpdatedAt"]);

  return {
    title: settings.browserTabTitle,
    description: "AI 驱动的专转本闯关学习 MVP",
    icons: {
      icon: `/api/site-icon?v=${settings.browserTabIconUpdatedAt?.getTime() ?? "default"}`
    }
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const settings = await getSystemSettings(["studentLearningFontFamily", "studentLearningFontSize"]);

  return (
    <html lang="zh-CN">
      <body>
        <StudentLearningTypographyScope
          fontFamily={settings.studentLearningFontFamily}
          fontSize={settings.studentLearningFontSize}
        >
          <Nav />
          <PostSuccessToast />
          {children}
        </StudentLearningTypographyScope>
      </body>
    </html>
  );
}
