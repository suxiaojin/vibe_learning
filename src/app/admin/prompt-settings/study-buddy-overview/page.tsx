import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";

export default async function SecondLevelOverviewPromptRedirect({
  searchParams
}: {
  searchParams?: Promise<{ notice?: string; error?: string; promptVersionId?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const query = new URLSearchParams({ section: "level2" });
  if (params?.notice) query.set("notice", params.notice);
  if (params?.error) query.set("error", params.error);
  if (params?.promptVersionId) query.set("promptVersionId", params.promptVersionId);
  redirect(`/admin/prompt-settings/study-buddy?${query.toString()}`);
}
