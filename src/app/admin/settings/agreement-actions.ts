"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { systemSettingsDefaults, systemSettingsId } from "@/lib/system-settings";
import { isAgreementKey, parseChangelog } from "@/lib/changelog-validation";

function refreshContent() {
  for (const path of ["/admin/settings", "/help", "/user-agreement", "/privacy-policy", "/platform-agreement"]) {
    revalidatePath(path);
  }
}

export async function saveAgreement(form: FormData) {
  await requireAdmin();
  const key = String(form.get("key") || "");
  const content = String(form.get("content") || "").trim();
  if (!isAgreementKey(key)) return { error: "栏目不存在。" };
  if (!content || content.length > 200000) return { error: "请填写正文，最多 200,000 字。" };
  await prisma.systemSetting.upsert({
    where: { id: systemSettingsId },
    create: { ...systemSettingsDefaults, [key]: content },
    update: { [key]: content }
  });
  refreshContent();
  return { success: true };
}

export async function saveChangelog(form: FormData) {
  await requireAdmin();
  const parsed = parseChangelog(form);
  if (parsed.error) return { error: parsed.error };
  const id = String(form.get("id") || "");
  if (id) {
    const result = await prisma.changelogEntry.updateMany({ where: { id }, data: parsed.data });
    if (!result.count) return { error: "这条更新日志已不存在，请刷新后重试。" };
  } else {
    await prisma.changelogEntry.create({ data: parsed.data });
  }
  refreshContent();
  return { success: true };
}

export async function withdrawChangelog(id: string) {
  await requireAdmin();
  const result = await prisma.changelogEntry.updateMany({ where: { id }, data: { isPublished: false } });
  if (!result.count) return { error: "这条更新日志已不存在，请刷新后重试。" };
  refreshContent();
  return { success: true };
}
