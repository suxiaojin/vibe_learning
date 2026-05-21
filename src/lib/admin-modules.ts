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
  { key: "dashboard", label: "仪表盘", href: "/admin/regions", icon: "dashboard", status: "published", sortOrder: 1, builtIn: true },
  { key: "regions", label: "区域管理", href: "/admin/regions", icon: "map", status: "published", sortOrder: 2, builtIn: true },
  { key: "public-subjects", label: "公共课管理", href: "/admin/public-subjects", icon: "book", status: "published", sortOrder: 3, builtIn: true },
  { key: "majors", label: "专业课管理", href: "/admin/majors", icon: "graduation", status: "published", sortOrder: 4, builtIn: true },
  { key: "question-banks", label: "题库管理", href: "/admin/question-banks", icon: "database", status: "published", sortOrder: 5, builtIn: true },
  { key: "settings", label: "系统设置", href: "/admin/regions", icon: "settings", status: "published", sortOrder: 99, builtIn: true }
];

async function ensureDefaultAdminModules() {
  await prisma.adminModule.createMany({
    data: defaultAdminModules,
    skipDuplicates: true
  });
}

export async function getAdminModules() {
  try {
    await ensureDefaultAdminModules();
    return prisma.adminModule.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
    });
  } catch {
    return defaultAdminModules;
  }
}

export async function getPublishedAdminModules() {
  const modules = await getAdminModules();
  return modules.filter((item) => item.status === "published");
}
