"use client";

import { Children, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type SettingsSection = { key: string; label: string };

export function AdminSettingsSectionLayout({
  children,
  sections,
  initialSection
}: {
  children: ReactNode;
  sections: SettingsSection[];
  initialSection?: string;
}) {
  const defaultSection = sections.find((section) => section.key === initialSection)?.key || sections[0]?.key || "";
  const [activeKey, setActiveKey] = useState(defaultSection);
  const panels = Children.toArray(children);

  return (
    <section className="border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-lg font-black text-ink">管理员配置</h2>
      <p className="mt-1 text-sm text-slate-500">选择左侧栏目查看和修改配置，各项设置分别保存。</p>
      <div className="mt-5 grid items-start gap-6 md:grid-cols-[200px_minmax(0,1fr)]">
        <nav aria-label="管理员配置栏目" className="flex overflow-x-auto border-b border-slate-200 md:block md:border-b-0 md:border-r">
          {sections.map((section) => (
            <button
              key={section.key}
              id={`admin-settings-section-${section.key}`}
              aria-controls={`admin-settings-panel-${section.key}`}
              type="button"
              aria-current={activeKey === section.key ? "page" : undefined}
              onClick={() => setActiveKey(section.key)}
              className={cn(
                "shrink-0 border-b-2 px-4 py-4 text-left text-sm md:block md:w-full md:border-b-0 md:border-l-4",
                activeKey === section.key ? "border-teal bg-teal/5 font-bold text-ink" : "border-transparent text-slate-600 hover:bg-slate-50"
              )}
            >
              {section.label}
            </button>
          ))}
        </nav>
        <div className="min-w-0">
          {sections.map((section, index) => (
            <div aria-labelledby={`admin-settings-section-${section.key}`} hidden={activeKey !== section.key} id={`admin-settings-panel-${section.key}`} key={section.key}>
              {panels[index]}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
