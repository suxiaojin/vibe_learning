import { ContentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type AdminModuleNavItem = {
  id?: string;
  key: string;
  label: string;
  href: string;
  icon: string;
  status: ContentStatus;
  sortOrder: number;
  builtIn: boolean;
};

const defaultAdminModules: AdminModuleNavItem[] = [
  { key: "dashboard", label: "仪表盘", href: "/sxjvbcontrol/dashboard", icon: "dashboard", status: "published", sortOrder: 1, builtIn: true },
  { key: "regions", label: "区域管理", href: "/sxjvbcontrol/regions", icon: "map", status: "published", sortOrder: 2, builtIn: true },
  { key: "public-subjects", label: "公共课管理", href: "/sxjvbcontrol/public-subjects", icon: "book", status: "published", sortOrder: 3, builtIn: true },
  { key: "majors", label: "专业课管理", href: "/sxjvbcontrol/majors", icon: "graduation", status: "published", sortOrder: 4, builtIn: true },
  { key: "question-banks", label: "题库管理", href: "/sxjvbcontrol/question-banks", icon: "database", status: "published", sortOrder: 5, builtIn: true },
  { key: "students", label: "学生管理", href: "/sxjvbcontrol/students", icon: "users", status: "published", sortOrder: 6, builtIn: true },
  { key: "notifications", label: "通知管理", href: "/sxjvbcontrol/notifications", icon: "bell", status: "published", sortOrder: 7, builtIn: true },
  { key: "ai-study-projects", label: "项目管理", href: "/sxjvbcontrol/ai-study-projects", icon: "project", status: "published", sortOrder: 8, builtIn: true },
  { key: "settings", label: "系统设置", href: "/sxjvbcontrol/settings", icon: "settings", status: "published", sortOrder: 99, builtIn: true },
  { key: "prompt-settings", label: "AI配置", href: "/sxjvbcontrol/prompt-settings", icon: "prompt", status: "published", sortOrder: 100, builtIn: true }
];

async function ensureDefaultAdminModules() {
  await prisma.adminModule.createMany({
    data: defaultAdminModules,
    skipDuplicates: true
  });
  await prisma.adminModule.updateMany({
    where: { key: "settings", href: { in: ["/admin/regions", "/sxjvbcontrol/regions"] } },
    data: { href: "/sxjvbcontrol/settings" }
  });
  await prisma.adminModule.updateMany({
    where: { key: "dashboard", href: { in: ["/admin/regions", "/sxjvbcontrol/regions"] } },
    data: { href: "/sxjvbcontrol/dashboard" }
  });
  await prisma.adminModule.updateMany({
    where: { key: "prompt-settings" },
    data: { label: "AI配置", href: "/sxjvbcontrol/prompt-settings" }
  });
}

export function normalizeAdminModuleHref(href: string) {
  return href.replace(/^\/admin(?=\/|[?#]|$)/, "/sxjvbcontrol");
}

export async function getAdminModules() {
  try {
    await ensureDefaultAdminModules();
    const modules = await prisma.adminModule.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
    });
    return modules.map((item) => ({ ...item, href: normalizeAdminModuleHref(item.href) }));
  } catch {
    return defaultAdminModules;
  }
}

export async function getPublishedAdminModules() {
  const modules = await getAdminModules();
  return modules.filter((item) => item.status === "published");
}
