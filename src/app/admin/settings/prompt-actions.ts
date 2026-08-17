"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import {
  defaultAiExplainSystemPrompt,
  defaultAiExplainUserPromptTemplate,
  validateAiExplainPrompt
} from "@/lib/ai-explain-prompt-template";
import { prisma } from "@/lib/prisma";

function promptSettingsPath(profileId?: string, key: "notice" | "error" = "notice", value?: string) {
  const query = new URLSearchParams({ tab: "prompt" });
  if (profileId) {
    query.set("promptProfileId", profileId);
  }
  if (value) {
    query.set(key, value);
  }
  return `/admin/settings?${query.toString()}`;
}

function requiredText(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

export async function createAiExplainPromptProfile(formData: FormData) {
  const admin = await requireAdmin();
  const name = requiredText(formData, "name");
  const description = requiredText(formData, "description");
  if (!name || name.length > 80) {
    redirect(promptSettingsPath(undefined, "error", "invalid-prompt-profile-name"));
  }

  const existing = await prisma.aiExplainPromptProfile.findUnique({ where: { name }, select: { id: true } });
  if (existing) {
    redirect(promptSettingsPath(existing.id, "error", "duplicate-prompt-profile-name"));
  }

  const profile = await prisma.$transaction(async (tx) => {
    const createdProfile = await tx.aiExplainPromptProfile.create({
      data: { name, description: description || null }
    });
    await tx.aiExplainPromptVersion.create({
      data: {
        profileId: createdProfile.id,
        version: 1,
        systemPrompt: defaultAiExplainSystemPrompt,
        userPromptTemplate: defaultAiExplainUserPromptTemplate,
        createdById: admin.id,
        createdByName: admin.username
      }
    });
    return createdProfile;
  });

  revalidatePath("/admin/settings");
  redirect(promptSettingsPath(profile.id, "notice", "prompt-profile-created"));
}

export async function saveAiExplainPromptDraft(formData: FormData) {
  const admin = await requireAdmin();
  const profileId = requiredText(formData, "profileId");
  const systemPrompt = requiredText(formData, "systemPrompt");
  const userPromptTemplate = requiredText(formData, "userPromptTemplate");
  const validationError = validateAiExplainPrompt(systemPrompt, userPromptTemplate);
  if (!profileId || validationError) {
    redirect(promptSettingsPath(profileId, "error", validationError ? "invalid-prompt-template" : "prompt-profile-not-found"));
  }

  await prisma.$transaction(async (tx) => {
    const profile = await tx.aiExplainPromptProfile.findUnique({
      where: { id: profileId },
      include: { versions: { orderBy: { version: "desc" } } }
    });
    if (!profile) {
      throw new Error("PROMPT_PROFILE_NOT_FOUND");
    }

    const draft = profile.versions.find((version) => !version.publishedAt);
    if (draft) {
      await tx.aiExplainPromptVersion.update({
        where: { id: draft.id },
        data: { systemPrompt, userPromptTemplate, createdById: admin.id, createdByName: admin.username }
      });
      return;
    }

    await tx.aiExplainPromptVersion.create({
      data: {
        profileId,
        version: (profile.versions[0]?.version || 0) + 1,
        systemPrompt,
        userPromptTemplate,
        createdById: admin.id,
        createdByName: admin.username
      }
    });
  }).catch((error) => {
    if (error instanceof Error && error.message === "PROMPT_PROFILE_NOT_FOUND") {
      redirect(promptSettingsPath(profileId, "error", "prompt-profile-not-found"));
    }
    throw error;
  });

  revalidatePath("/admin/settings");
  redirect(promptSettingsPath(profileId, "notice", "prompt-draft-saved"));
}

export async function publishAiExplainPromptDraft(formData: FormData) {
  const admin = await requireAdmin();
  const profileId = requiredText(formData, "profileId");
  const changeNote = requiredText(formData, "changeNote");
  const invalidateExisting = requiredText(formData, "publishScope") === "invalidate";
  if (!profileId || !changeNote || changeNote.length > 200) {
    redirect(promptSettingsPath(profileId, "error", "invalid-prompt-publish-note"));
  }

  const published = await prisma.$transaction(async (tx) => {
    const draft = await tx.aiExplainPromptVersion.findFirst({
      where: { profileId, publishedAt: null },
      orderBy: { version: "desc" }
    });
    if (!draft) {
      return false;
    }
    const publishedAt = new Date();
    await tx.aiExplainPromptVersion.update({
      where: { id: draft.id },
      data: {
        changeNote,
        invalidateExisting,
        publishedAt,
        createdById: admin.id,
        createdByName: admin.username
      }
    });
    await tx.aiExplainPromptProfile.update({
      where: { id: profileId },
      data: {
        activeVersionId: draft.id,
        ...(invalidateExisting ? { cacheInvalidatedAt: publishedAt } : {})
      }
    });
    return true;
  });
  if (!published) {
    redirect(promptSettingsPath(profileId, "error", "prompt-draft-not-found"));
  }

  revalidatePath("/admin/settings");
  redirect(promptSettingsPath(profileId, "notice", "prompt-version-published"));
}

export async function discardAiExplainPromptDraft(formData: FormData) {
  await requireAdmin();
  const profileId = requiredText(formData, "profileId");
  const draft = await prisma.aiExplainPromptVersion.findFirst({
    where: { profileId, publishedAt: null },
    select: { id: true }
  });
  if (draft) {
    await prisma.aiExplainPromptVersion.delete({ where: { id: draft.id } });
  }
  revalidatePath("/admin/settings");
  redirect(promptSettingsPath(profileId, "notice", "prompt-draft-discarded"));
}

export async function deleteAiExplainPromptProfile(formData: FormData) {
  await requireAdmin();
  const profileId = requiredText(formData, "profileId");
  const profile = await prisma.aiExplainPromptProfile.findUnique({
    where: { id: profileId },
    select: { id: true, isDefault: true }
  });
  if (!profile) {
    redirect(promptSettingsPath(undefined, "error", "prompt-profile-not-found"));
  }
  if (profile.isDefault) {
    redirect(promptSettingsPath(profile.id, "error", "prompt-default-profile-cannot-delete"));
  }

  await prisma.aiExplainPromptProfile.delete({ where: { id: profile.id } });
  revalidatePath("/admin/settings");
  redirect(promptSettingsPath(undefined, "notice", "prompt-profile-deleted"));
}

export async function rollbackAiExplainPromptVersion(formData: FormData) {
  const admin = await requireAdmin();
  const profileId = requiredText(formData, "profileId");
  const versionId = requiredText(formData, "versionId");
  const rolledBack = await prisma.$transaction(async (tx) => {
    const [target, latest, existingDraft] = await Promise.all([
      tx.aiExplainPromptVersion.findFirst({ where: { id: versionId, profileId, publishedAt: { not: null } } }),
      tx.aiExplainPromptVersion.findFirst({ where: { profileId }, orderBy: { version: "desc" }, select: { version: true } }),
      tx.aiExplainPromptVersion.findFirst({ where: { profileId, publishedAt: null }, select: { id: true } })
    ]);
    if (!target) {
      return "missing" as const;
    }
    if (existingDraft) {
      return "draft" as const;
    }
    const publishedAt = new Date();
    const restored = await tx.aiExplainPromptVersion.create({
      data: {
        profileId,
        version: (latest?.version || 0) + 1,
        systemPrompt: target.systemPrompt,
        userPromptTemplate: target.userPromptTemplate,
        changeNote: `回滚至 v${target.version}`,
        invalidateExisting: false,
        publishedAt,
        createdById: admin.id,
        createdByName: admin.username
      }
    });
    await tx.aiExplainPromptProfile.update({
      where: { id: profileId },
      data: { activeVersionId: restored.id }
    });
    return "ok" as const;
  });
  if (rolledBack === "missing") {
    redirect(promptSettingsPath(profileId, "error", "prompt-version-not-found"));
  }
  if (rolledBack === "draft") {
    redirect(promptSettingsPath(profileId, "error", "prompt-discard-draft-before-rollback"));
  }
  revalidatePath("/admin/settings");
  redirect(promptSettingsPath(profileId, "notice", "prompt-version-rolled-back"));
}

export async function bindMajorAiExplainPrompt(formData: FormData) {
  await requireAdmin();
  const profileId = requiredText(formData, "profileId");
  const regionId = requiredText(formData, "regionId");
  const majorId = requiredText(formData, "majorId");
  const [profile, regionMajor] = await Promise.all([
    prisma.aiExplainPromptProfile.findUnique({ where: { id: profileId }, select: { id: true } }),
    prisma.regionMajor.findUnique({
      where: { regionId_majorId: { regionId, majorId } },
      select: { id: true }
    })
  ]);
  if (!profile || !regionMajor) {
    redirect(promptSettingsPath(profileId, "error", "prompt-course-binding-invalid"));
  }
  await prisma.regionMajor.update({
    where: { id: regionMajor.id },
    data: { aiExplainPromptProfileId: profileId }
  });
  revalidatePath("/admin/settings");
  redirect(promptSettingsPath(profileId, "notice", "prompt-course-bound"));
}

export async function unbindMajorAiExplainPrompt(formData: FormData) {
  await requireAdmin();
  const profileId = requiredText(formData, "profileId");
  const regionMajorId = requiredText(formData, "regionMajorId");
  await prisma.regionMajor.updateMany({
    where: { id: regionMajorId, aiExplainPromptProfileId: profileId },
    data: { aiExplainPromptProfileId: null }
  });
  revalidatePath("/admin/settings");
  redirect(promptSettingsPath(profileId, "notice", "prompt-course-unbound"));
}
