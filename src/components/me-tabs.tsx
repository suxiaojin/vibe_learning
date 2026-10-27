"use client";

import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type MeTab = "homepage" | "profile" | "medals" | "diamonds";

const meTabs: Array<{ key: MeTab; label: string }> = [
  { key: "homepage", label: "我的主页" },
  { key: "profile", label: "我的信息" },
  { key: "medals", label: "我的勋章" },
  { key: "diamonds", label: "我的钻石" }
];

function tabFromUrl(): MeTab {
  const tab = new URLSearchParams(window.location.search).get("tab");
  return meTabs.find((item) => item.key === tab)?.key || "homepage";
}

export function MeTabs({
  initialTab,
  notices,
  panels
}: {
  initialTab: MeTab;
  notices: ReactNode;
  panels: Record<MeTab, ReactNode>;
}) {
  const [activeTab, setActiveTab] = useState<MeTab>(initialTab);
  const activeIndex = meTabs.findIndex((item) => item.key === activeTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    const onPopState = () => setActiveTab(tabFromUrl());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function selectTab(tab: MeTab) {
    if (tab === activeTab) return;
    setActiveTab(tab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    window.history.pushState(window.history.state, "", url);
  }

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % meTabs.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + meTabs.length) % meTabs.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = meTabs.length - 1;
    else return;

    event.preventDefault();
    selectTab(meTabs[nextIndex].key);
    document.getElementById(`me-tab-${meTabs[nextIndex].key}`)?.focus();
  }

  return (
    <div className="space-y-6">
      <div aria-label="个人档案功能" className="relative grid w-full max-w-[440px] grid-cols-4 border-b border-slate-200" role="tablist">
        {meTabs.map((tab, index) => (
          <button
            key={tab.key}
            aria-controls={`me-panel-${tab.key}`}
            aria-selected={activeTab === tab.key}
            className={cn(
              "min-w-0 px-1 py-4 text-center text-sm transition-colors duration-200 focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/40",
              activeTab === tab.key ? "font-semibold text-ink" : "text-slate-400 hover:text-slate-600"
            )}
            id={`me-tab-${tab.key}`}
            onClick={() => selectTab(tab.key)}
            onKeyDown={(event) => onTabKeyDown(event, index)}
            role="tab"
            tabIndex={activeTab === tab.key ? 0 : -1}
            type="button"
          >
            {tab.label}
          </button>
        ))}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 left-0 w-1/4 transition-transform duration-300 ease-out motion-reduce:transition-none"
          style={{ transform: `translate3d(${activeIndex * 100}%, 1px, 0)` }}
        >
          <span className="mx-auto block h-0.5 w-3/5 bg-teal" />
        </span>
      </div>

      {notices}

      {meTabs.map((tab) => (
        <div
          key={tab.key}
          aria-labelledby={`me-tab-${tab.key}`}
          hidden={activeTab !== tab.key}
          id={`me-panel-${tab.key}`}
          role="tabpanel"
          tabIndex={0}
        >
          {panels[tab.key]}
        </div>
      ))}
    </div>
  );
}
