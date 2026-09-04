"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import {
  aiStudyPromptTemplateKeys,
  normalizeAiStudyPromptTemplates,
  validateAiStudyPromptTemplates
} from "@/lib/ai-study-prompt-template";
import {
  buildAiStudyPromptSourceVersion,
  ensureAiStudyPromptProfile
} from "@/lib/ai-study-prompts";
import { prisma } from "@/lib/prisma";

const settingsPath = "/admin/prompt-settings/study-buddy";

function targetPath(key: "notice" | "error", value: string) {
  return `${settingsPath}?${key}=${encodeURIComponent(value)}`;
}

function requiredText(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function readTemplates(formData: FormData) {
  return normalizeAiStudyPromptTemplates(Object.fromEntries(
    aiStudyPromptTemplateKeys.map((key) => [key, requiredText(formData, `template:${key}`)])
  ));
}

export async function saveAiStudyPromptDraft(formData: FormData) {
  const admin = await requireAdmin();
  const templates = readTemplates(formData);
  if (validateAiStudyPromptTemplates(templates)) {
    redirect(targetPath("error", "invalid-template"));
  }

  const profile = await ensureAiStudyPromptProfile();
  await prisma.$transaction(async (tx) => {
    const draft = await tx.aiStudyPromptVersion.findFirst({
      where: { profileId: profile.id, publishedAt: null },
      orderBy: { version: "desc" }
    });
    if (draft) {
      await tx.aiStudyPromptVersion.update({
        where: { id: draft.id },
        data: {
          templates: templates as Prisma.InputJsonValue,
          createdById: admin.id,
          createdByName: admin.username
        }
      });
      return;
    }

    const latest = await tx.aiStudyPromptVersion.findFirst({
      where: { profileId: profile.id },
      orderBy: { version: "desc" },
      select: { version: true }
    });
    const nextVersion = (latest?.version || 0) + 1;
    await tx.aiStudyPromptVersion.create({
      data: {
        profileId: profile.id,
        version: nextVersion,
        sourceVersion: buildAiStudyPromptSourceVersion(nextVersion),
        templates: templates as Prisma.InputJsonValue,
        createdById: admin.id,
        createdByName: admin.username
      }
    });
  });

  revalidatePath(settingsPath);
  redirect(targetPath("notice", "draft-saved"));
}

export async function publishAiStudyPromptDraft(formData: FormData) {
  const admin = await requireAdmin();
  const changeNote = requiredText(formData, "changeNote");
  if (!changeNote || changeNote.length > 200) {
    redirect(targetPath("error", "invalid-publish-note"));
  }

  const profile = await ensureAiStudyPromptProfile();
  const result = await prisma.$transaction(async (tx) => {
    const draft = await tx.aiStudyPromptVersion.findFirst({
      where: { profileId: profile.id, publishedAt: null },
      orderBy: { version: "desc" }
    });
    if (!draft) {
      return "missing" as const;
    }
    if (validateAiStudyPromptTemplates(draft.templates)) {
      return "invalid" as const;
    }

    await tx.aiStudyPromptVersion.update({
      where: { id: draft.id },
      data: {
        changeNote,
        publishedAt: new Date(),
        createdById: admin.id,
        createdByName: admin.username
      }
    });
    await tx.aiStudyPromptProfile.update({
      where: { id: profile.id },
      data: { activeVersionId: draft.id }
    });
    return "ok" as const;
  });

  if (result === "missing") {
    redirect(targetPath("error", "draft-not-found"));
  }
  if (result === "invalid") {
    redirect(targetPath("error", "invalid-template"));
  }
  revalidatePath(settingsPath);
  redirect(targetPath("notice", "version-published"));
}

export async function discardAiStudyPromptDraft() {
  await requireAdmin();
  const profile = await ensureAiStudyPromptProfile();
  await prisma.aiStudyPromptVersion.deleteMany({
    where: { profileId: profile.id, publishedAt: null }
  });
  revalidatePath(settingsPath);
  redirect(targetPath("notice", "draft-discarded"));
}

export async function rollbackAiStudyPromptVersion(formData: FormData) {
  const admin = await requireAdmin();
  const targetVersionId = requiredText(formData, "versionId");
  const profile = await ensureAiStudyPromptProfile();
  const result = await prisma.$transaction(async (tx) => {
    const [target, latest, draft] = await Promise.all([
      tx.aiStudyPromptVersion.findFirst({ where: { id: targetVersionId, profileId: profile.id, publishedAt: { not: null } } }),
      tx.aiStudyPromptVersion.findFirst({ where: { profileId: profile.id }, orderBy: { version: "desc" }, select: { version: true } }),
      tx.aiStudyPromptVersion.findFirst({ where: { profileId: profile.id, publishedAt: null }, select: { id: true } })
    ]);
    if (!target) {
      return "missing" as const;
    }
    if (draft) {
      return "draft" as const;
    }
    const nextVersion = (latest?.version || 0) + 1;
    const restored = await tx.aiStudyPromptVersion.create({
      data: {
        profileId: profile.id,
        version: nextVersion,
        sourceVersion: buildAiStudyPromptSourceVersion(nextVersion, `rollback-v${target.version}`),
        templates: target.templates as Prisma.InputJsonValue,
        changeNote: `回滚至 v${target.version}`,
        publishedAt: new Date(),
        createdById: admin.id,
        createdByName: admin.username
      }
    });
    await tx.aiStudyPromptProfile.update({
      where: { id: profile.id },
      data: { activeVersionId: restored.id }
    });
    return "ok" as const;
  });

  if (result === "missing") {
    redirect(targetPath("error", "version-not-found"));
  }
  if (result === "draft") {
    redirect(targetPath("error", "discard-draft-before-rollback"));
  }
  revalidatePath(settingsPath);
  redirect(targetPath("notice", "version-rolled-back"));
}
