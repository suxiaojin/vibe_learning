import { AdminShell } from "@/components/admin-shell";
import { getPublishedAdminModules } from "@/lib/admin-modules";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const modules = await getPublishedAdminModules();
  return <AdminShell modules={modules}>{children}</AdminShell>;
}
