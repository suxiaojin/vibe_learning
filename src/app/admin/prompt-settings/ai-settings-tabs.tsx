import Link from "next/link";

const tabs = [
  { id: "course", href: "/admin/prompt-settings", label: "闯关页prompt" },
  { id: "study-buddy", href: "/admin/prompt-settings/study-buddy", label: "学习搭子prompt" },
  { id: "ai-server", href: "/admin/prompt-settings/ai-server", label: "AI服务器配置" },
  { id: "mineru", href: "/admin/prompt-settings/study-mineru", label: "学习搭子 PDF 解析" }
] as const;

export function AiSettingsTabs({ active }: { active: (typeof tabs)[number]["id"] }) {
  return (
    <nav className="flex gap-8 overflow-x-auto whitespace-nowrap border-b border-slate-200 text-sm font-bold text-slate-600" aria-label="AI配置导航">
      {tabs.map(({ id, href, label }) => (
        <Link key={id} href={href} aria-current={id === active ? "page" : undefined}
          className={id === active
            ? "border-b-2 border-teal py-3 text-ink"
            : "border-b-2 border-transparent py-3 transition hover:border-teal hover:text-teal"}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
