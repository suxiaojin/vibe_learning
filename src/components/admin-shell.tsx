"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  BookOpenCheck,
  CircleHelp,
  GraduationCap,
  Grid3X3,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  MapPinned,
  Plus,
  Settings
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  {
    label: "仪表盘",
    description: "后台总览",
    href: "/admin/regions",
    icon: LayoutDashboard
  },
  {
    label: "区域管理",
    description: "省份与学制",
    href: "/admin/regions",
    icon: MapPinned
  },
  {
    label: "公共课管理",
    description: "区域公共课",
    href: "/admin/public-subjects",
    icon: BookOpenCheck
  },
  {
    label: "专业课管理",
    description: "区域专业",
    href: "/admin/majors",
    icon: GraduationCap
  },
  {
    label: "系统设置",
    description: "系统设置",
    href: "/admin/regions",
    icon: Settings
  }
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[#f5f6fa] text-[#20242a] lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-[#2d3235] text-white lg:flex">
        <div className="border-b border-white/10 px-6 py-6">
          <h1 className="text-xl font-black leading-snug">江苏专转本后台题库管理系统</h1>
          <p className="mt-2 text-xs font-semibold text-white/55">管理控制台</p>
        </div>

        <div className="px-5 py-5">
          <Link
            href="/admin/regions"
            className="flex h-10 items-center justify-center gap-2 bg-[#0872b9] text-sm font-bold text-white shadow-sm transition hover:bg-[#0767a8]"
          >
            <Plus size={16} />
            新增配置
          </Link>
        </div>

        <nav className="flex-1 px-3" aria-label="后台管理导航">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname.startsWith(item.href) && item.label !== "仪表盘" && item.label !== "系统设置";
            return (
              <Link
                key={`${item.label}-${item.href}`}
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
          <Link href="/api/auth/logout" className="flex min-h-11 items-center gap-3 px-4 text-sm font-bold text-white/75 hover:bg-white/5 hover:text-white">
            <LogOut size={18} />
            退出登录
          </Link>
        </div>
      </aside>

      <div className="min-h-screen">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6 shadow-sm">
          <div>
            <h2 className="text-xl font-black leading-tight tracking-normal">江苏专转本学习系统</h2>
            <p className="-mt-0.5 text-xl font-black leading-tight tracking-normal">后台管理</p>
          </div>
          <div className="flex items-center gap-4 text-slate-700">
            <button className="grid size-9 place-items-center hover:bg-slate-100" type="button" aria-label="通知">
              <Bell size={20} />
            </button>
            <button className="grid size-9 place-items-center hover:bg-slate-100" type="button" aria-label="帮助">
              <CircleHelp size={20} />
            </button>
            <button className="grid size-9 place-items-center hover:bg-slate-100" type="button" aria-label="应用">
              <Grid3X3 size={20} />
            </button>
            <span className="h-8 w-px bg-slate-200" />
            <span className="text-sm font-semibold">管理员</span>
            <div className="size-9 overflow-hidden rounded-full bg-slate-800">
              <div className="grid size-full place-items-center text-xs font-black text-white">A</div>
            </div>
          </div>
        </header>

        <main className="px-6 py-7">{children}</main>
      </div>
    </div>
  );
}
