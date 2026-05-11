"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookMarked, FileQuestion, Layers3, UsersRound } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  {
    label: "章节管理",
    description: "维护课程章节与排序",
    href: "/admin/chapters",
    icon: Layers3
  },
  {
    label: "知识点管理",
    description: "配置每关复习内容",
    href: "/admin/knowledge-points",
    icon: BookMarked
  },
  {
    label: "题库管理",
    description: "录入题目与解析",
    href: "/admin/questions",
    icon: FileQuestion
  },
  {
    label: "学生管理",
    description: "查看学生学习状态",
    href: "/admin/students",
    icon: UsersRound
  }
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const current = navItems.find((item) => pathname.startsWith(item.href)) ?? navItems[0];

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 lg:flex-row lg:gap-6">
      <aside className="lg:sticky lg:top-24 lg:h-[calc(100dvh-120px)] lg:w-72 lg:shrink-0">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft lg:h-full">
          <div className="px-2 pb-4">
            <p className="text-sm font-semibold text-teal">内容管理后台</p>
            <h1 className="mt-1 text-2xl font-bold text-ink">江苏专转本计算机</h1>
          </div>
          <nav className="grid gap-2" aria-label="后台管理导航">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex min-h-16 items-center gap-3 rounded-xl px-3 py-3 text-left transition",
                    active ? "bg-teal text-white shadow-sm" : "text-slate-700 hover:bg-slate-100 hover:text-ink"
                  )}
                >
                  <span
                    className={cn(
                      "grid size-10 shrink-0 place-items-center rounded-xl",
                      active ? "bg-white/15 text-white" : "bg-mist text-teal"
                    )}
                  >
                    <Icon size={20} />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold">{item.label}</span>
                    <span className={cn("mt-0.5 block text-xs", active ? "text-white/75" : "text-slate-500")}>
                      {item.description}
                    </span>
                  </span>
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>
      <section className="min-w-0 flex-1">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-teal">{current.description}</p>
            <h2 className="mt-1 text-2xl font-bold text-ink">{current.label}</h2>
          </div>
        </div>
        {children}
      </section>
    </div>
  );
}
