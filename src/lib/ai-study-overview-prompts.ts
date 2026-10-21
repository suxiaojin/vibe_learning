import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import {
  defaultAiStudyOverviewPromptTemplates,
  normalizeAiStudyOverviewPromptTemplates,
  validateAiStudyOverviewPromptTemplates
} from "./ai-study-overview-prompt-template";

const profileKey = "second-level-overview";
const seedSourceVersion = "ai-study-overview-v1-default";

export function buildAiStudyOverviewPromptSourceVersion(version: number, suffix = "admin") {
  return `ai-study-overview-v${version}-${suffix}`;
}

export async function ensureAiStudyOverviewPromptProfile() {
  const existing = await prisma.aiStudyPromptProfile.findUnique({
    where: { key: profileKey }, include: { activeVersion: true }
  });
  if (existing?.activeVersion) return existing;
  return prisma.$transaction(async (tx) => {
    const profile = await tx.aiStudyPromptProfile.upsert({
      where: { key: profileKey },
      create: { key: profileKey, name: "二层内容概述 Prompt" },
      update: {}
    });
    const latest = await tx.aiStudyPromptVersion.findFirst({
      where: { profileId: profile.id, publishedAt: { not: null } }, orderBy: { version: "desc" }
    });
    const active = latest || await tx.aiStudyPromptVersion.upsert({
      where: { profileId_version: { profileId: profile.id, version: 1 } },
      create: {
        profileId: profile.id, version: 1, sourceVersion: seedSourceVersion,
        templates: defaultAiStudyOverviewPromptTemplates as Prisma.InputJsonValue,
        changeNote: "二层内容概述默认Prompt", publishedAt: new Date(), createdByName: "系统初始化"
      },
      update: {}
    });
    await tx.aiStudyPromptProfile.update({ where: { id: profile.id }, data: { activeVersionId: active.id } });
    return tx.aiStudyPromptProfile.findUniqueOrThrow({ where: { id: profile.id }, include: { activeVersion: true } });
  });
}

export async function getAiStudyOverviewPromptConfig() {
  const profile = await ensureAiStudyOverviewPromptProfile();
  const version = profile.activeVersion;
  if (!version) throw new Error("二层内容概述没有已发布的Prompt版本。");
  const templates = normalizeAiStudyOverviewPromptTemplates(version.templates);
  const error = validateAiStudyOverviewPromptTemplates(templates);
  if (error) throw new Error(`二层内容概述Prompt v${version.version} 无效：${error}`);
  return { id: version.id, sourceVersion: version.sourceVersion, templates };
}

export async function getAiStudyOverviewPromptProfileForAdmin() {
  const profile = await ensureAiStudyOverviewPromptProfile();
  return prisma.aiStudyPromptProfile.findUniqueOrThrow({
    where: { id: profile.id }, include: { activeVersion: true, versions: { orderBy: { version: "desc" } } }
  });
}
