import type { Metadata } from "next";
import { Nav } from "@/components/nav";
import { PostSuccessToast } from "@/components/post-success-toast";
import "katex/dist/katex.min.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vibe Learning",
  description: "AI 驱动的专转本闯关学习 MVP"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <Nav />
        <PostSuccessToast />
        {children}
      </body>
    </html>
  );
}
