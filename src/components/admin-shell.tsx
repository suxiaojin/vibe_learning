"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import {
  Bell,
  BookOpenCheck,
  Database,
  GraduationCap,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  MapPinned,
  Settings,
  UsersRound
} from "lucide-react";
import type { AdminModuleNavItem } from "@/lib/admin-modules";
import { cn } from "@/lib/utils";

const iconMap = {
  bell: Bell,
  book: BookOpenCheck,
  database: Database,
  dashboard: LayoutDashboard,
  graduation: GraduationCap,
  map: MapPinned,
  project: BookOpenCheck,
  settings: Settings,
  users: UsersRound
};

export function AdminShell({ children, modules }: { children: React.ReactNode; modules: AdminModuleNavItem[] }) {
  const pathname = usePathname();
  const isAdminLogin = pathname === "/admin/login";
  const isQuestionBankWorkspace = pathname.startsWith("/admin/question-banks");

  useEffect(() => {
    function closeOpenDetails(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      document.querySelectorAll("details[open]").forEach((details) => {
        if (!details.contains(target)) {
          details.removeAttribute("open");
        }
      });
    }
    document.addEventListener("pointerdown", closeOpenDetails);
    return () => document.removeEventListener("pointerdown", closeOpenDetails);
  }, []);

  if (isAdminLogin || isQuestionBankWorkspace) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-[#f5f6fa] text-[#20242a] lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-[#2d3235] text-white lg:flex">
        <div className="border-b border-white/10 px-6 py-6">
          <h1 className="text-xl font-black leading-snug">江苏专转本后台题库管理系统</h1>
          <p className="mt-2 text-xs font-semibold text-white/55">管理控制台</p>
        </div>

        <div className="px-5 py-5">
          <Link
            href="/admin/module-config"
            className="flex h-10 items-center justify-center gap-2 bg-[#0872b9] text-sm font-bold text-white shadow-sm transition hover:bg-[#0767a8]"
          >
            <Settings size={16} />
            配置管理
          </Link>
        </div>

        <nav className="flex-1 px-3" aria-label="后台管理导航">
          {modules.map((item) => {
            const Icon = iconMap[item.icon as keyof typeof iconMap] || Settings;
            const active = item.key === "dashboard" ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link
                key={`${item.key}-${item.href}`}
                href={item.href}
                className={cn(
                  "mb-1 flex min-h-11 items-center gap-3 border-r-4 border-transparent px-4 text-sm font-bold transition",
                  active ? "border-[#9bc3ff] bg-[#243d55] text-[#cfe5ff]" : "text-white/75 hover:bg-white/5 hover:text-white"
                )}
              >
                <Icon size={18} />
                <span className="min-w-0 truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/10 px-3 py-4">
          <Link href="/admin/regions" className="mb-1 flex min-h-11 items-center gap-3 px-4 text-sm font-bold text-white/75 hover:bg-white/5 hover:text-white">
            <LifeBuoy size={18} />
            帮助支持
          </Link>
          <form action="/api/auth/admin-logout" method="post">
            <button className="flex min-h-11 w-full items-center gap-3 px-4 text-left text-sm font-bold text-white/75 hover:bg-white/5 hover:text-white" type="submit">
              <LogOut size={18} />
              退出登录
            </button>
          </form>
        </div>
      </aside>

      <div className="min-h-screen">
        <main className="px-6 py-7">{children}</main>
      </div>
    </div>
  );
}
