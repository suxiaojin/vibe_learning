import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { MarkdownContent } from "@/components/agreement-content-page";
import { HelpContactSidebar } from "@/components/help-contact-sidebar";
import { StudentPageShell } from "@/components/student-page-shell";
import { requireUser } from "@/lib/auth";
import { getSystemSettings } from "@/lib/system-settings";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const tabs = [
  { key: "faq", label: "常见问题" },
  { key: "changelog", label: "更新日志" }
] as const;

export default async function HelpPage({ searchParams }: { searchParams?: Promise<{ tab?: string }> }) {
  await requireUser();
  const [settings, params] = await Promise.all([getSystemSettings(), searchParams]);
  const activeTab = params?.tab === "changelog" ? tabs[1] : tabs[0];
  const content = activeTab.key === "changelog" ? settings.changelogContent : settings.faqContent;

  return (
    <StudentPageShell active="help" contentClassName="pr-24 lg:pr-28 xl:pr-28" maxWidthClassName="max-w-6xl">
      <nav aria-label="面包屑" className="mb-5 flex items-center gap-2 text-sm text-slate-600">
        <Link className="hover:text-ink" href="/learn">首页</Link>
        <ChevronRight aria-hidden="true" size={14} />
        <span>帮助中心</span>
      </nav>
      <div className="grid items-start gap-5 md:grid-cols-[200px_minmax(0,1fr)]">
        <nav aria-label="帮助中心栏目" className="grid grid-cols-2 bg-white md:grid-cols-1 md:py-2">
          {tabs.map((tab) => (
            <Link
              key={tab.key}
              aria-current={activeTab.key === tab.key ? "page" : undefined}
              className={cn(
                "flex min-h-14 items-center justify-center border-b-2 px-5 py-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal md:border-b-0 md:border-l-4",
                activeTab.key === tab.key ? "border-teal bg-teal/5 font-semibold text-ink" : "border-transparent text-slate-600 hover:bg-slate-50 hover:text-ink"
              )}
              href={`/help?tab=${tab.key}`}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
        <section aria-labelledby="help-content-heading" className="min-h-[480px] min-w-0 rounded-md bg-white px-5 py-5 sm:px-8">
          <h1 id="help-content-heading" className="mb-4 border-b border-slate-100 pb-4 text-sm font-medium text-slate-700">{activeTab.label}</h1>
          <article>
            {content.trim() ? <MarkdownContent content={content} variant="help" /> : null}
          </article>
        </section>
      </div>
      <HelpContactSidebar email={settings.customerServiceEmail} wechatQrCodeUrl="/help-center-wechat-qr.png" />
    </StudentPageShell>
  );
}
