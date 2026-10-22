"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import {
  normalizeAiStudyOverviewPromptTemplates,
  validateAiStudyOverviewPromptTemplates
} from "@/lib/ai-study-overview-prompt-template";
import {
  buildAiStudyOverviewPromptSourceVersion,
  ensureAiStudyOverviewPromptProfile
} from "@/lib/ai-study-overview-prompts";
import { prisma } from "@/lib/prisma";

const settingsPath = "/admin/prompt-settings/study-buddy";
const targetPath = (kind: "notice" | "error", value: string) => `${settingsPath}?section=level2&${kind}=${encodeURIComponent(value)}`;
const requiredText = (data: FormData, key: string) => String(data.get(key) || "").trim();

export async function saveAiStudyOverviewPromptDraft(formData: FormData) {
  const admin = await requireAdmin();
  const templates = normalizeAiStudyOverviewPromptTemplates({
    "overview.system": requiredText(formData, "template:overview.system"),
    "overview.user": requiredText(formData, "template:overview.user")
  });
  if (validateAiStudyOverviewPromptTemplates(templates)) redirect(targetPath("error", "invalid-template"));
  const profile = await ensureAiStudyOverviewPromptProfile();
  await prisma.$transaction(async (tx) => {
    const draft = await tx.aiStudyPromptVersion.findFirst({ where: { profileId: profile.id, publishedAt: null }, orderBy: { version: "desc" } });
    if (draft) {
      await tx.aiStudyPromptVersion.update({
        where: { id: draft.id },
        data: { templates: templates as Prisma.InputJsonValue, createdById: admin.id, createdByName: admin.username }
      });
      return;
    }
    const latest = await tx.aiStudyPromptVersion.findFirst({ where: { profileId: profile.id }, orderBy: { version: "desc" }, select: { version: true } });
    const version = (latest?.version || 0) + 1;
    await tx.aiStudyPromptVersion.create({ data: {
      profileId: profile.id, version, sourceVersion: buildAiStudyOverviewPromptSourceVersion(version),
      templates: templates as Prisma.InputJsonValue, createdById: admin.id, createdByName: admin.username
    } });
  });
  revalidatePath(settingsPath);
  redirect(targetPath("notice", "draft-saved"));
}

export async function publishAiStudyOverviewPromptDraft(formData: FormData) {
  const admin = await requireAdmin();
  const changeNote = requiredText(formData, "changeNote");
  if (!changeNote || changeNote.length > 200) redirect(targetPath("error", "invalid-publish-note"));
  const profile = await ensureAiStudyOverviewPromptProfile();
  const result = await prisma.$transaction(async (tx) => {
    const draft = await tx.aiStudyPromptVersion.findFirst({ where: { profileId: profile.id, publishedAt: null }, orderBy: { version: "desc" } });
    if (!draft) return "missing" as const;
    if (validateAiStudyOverviewPromptTemplates(draft.templates)) return "invalid" as const;
    await tx.aiStudyPromptVersion.update({ where: { id: draft.id }, data: {
      changeNote, publishedAt: new Date(), createdById: admin.id, createdByName: admin.username
    } });
    await tx.aiStudyPromptProfile.update({ where: { id: profile.id }, data: { activeVersionId: draft.id } });
    return "ok" as const;
  });
  if (result === "missing") redirect(targetPath("error", "draft-not-found"));
  if (result === "invalid") redirect(targetPath("error", "invalid-template"));
  revalidatePath(settingsPath);
  redirect(targetPath("notice", "version-published"));
}

export async function discardAiStudyOverviewPromptDraft() {
  await requireAdmin();
  const profile = await ensureAiStudyOverviewPromptProfile();
  await prisma.aiStudyPromptVersion.deleteMany({ where: { profileId: profile.id, publishedAt: null } });
  revalidatePath(settingsPath);
  redirect(targetPath("notice", "draft-discarded"));
}

export async function rollbackAiStudyOverviewPromptVersion(formData: FormData) {
  const admin = await requireAdmin();
  const versionId = requiredText(formData, "versionId");
  const profile = await ensureAiStudyOverviewPromptProfile();
  const result = await prisma.$transaction(async (tx) => {
    const [target, latest, draft] = await Promise.all([
      tx.aiStudyPromptVersion.findFirst({ where: { id: versionId, profileId: profile.id, publishedAt: { not: null } } }),
      tx.aiStudyPromptVersion.findFirst({ where: { profileId: profile.id }, orderBy: { version: "desc" }, select: { version: true } }),
      tx.aiStudyPromptVersion.findFirst({ where: { profileId: profile.id, publishedAt: null }, select: { id: true } })
    ]);
    if (!target) return "missing" as const;
    if (draft) return "draft" as const;
    const version = (latest?.version || 0) + 1;
    const restored = await tx.aiStudyPromptVersion.create({ data: {
      profileId: profile.id, version,
      sourceVersion: buildAiStudyOverviewPromptSourceVersion(version, `rollback-v${target.version}`),
      templates: normalizeAiStudyOverviewPromptTemplates(target.templates) as Prisma.InputJsonValue,
      changeNote: `回滚至 v${target.version}`, publishedAt: new Date(),
      createdById: admin.id, createdByName: admin.username
    } });
    await tx.aiStudyPromptProfile.update({ where: { id: profile.id }, data: { activeVersionId: restored.id } });
    return "ok" as const;
  });
  if (result === "missing") redirect(targetPath("error", "version-not-found"));
  if (result === "draft") redirect(targetPath("error", "discard-draft-before-rollback"));
  revalidatePath(settingsPath);
  redirect(targetPath("notice", "version-rolled-back"));
}
