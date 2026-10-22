import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import {
  defaultAiStudyOverviewPromptTemplates,
  defaultAiStudyThirdLevelOverviewPromptTemplates,
  normalizeAiStudyOverviewPromptTemplates,
  validateAiStudyOverviewPromptTemplates
} from "./ai-study-overview-prompt-template";

export type AiStudyOverviewDepth = 1 | 2;

function profileSettings(depth: AiStudyOverviewDepth) {
  return depth === 1
    ? { key: "second-level-overview", name: "二层内容概述 Prompt", seedSourceVersion: "ai-study-overview-v1-default", defaults: defaultAiStudyOverviewPromptTemplates, label: "二层" }
    : { key: "third-level-overview", name: "三层内容概述 Prompt", seedSourceVersion: "ai-study-level3-overview-v1-default", defaults: defaultAiStudyThirdLevelOverviewPromptTemplates, label: "三层" };
}

export function buildAiStudyOverviewPromptSourceVersion(version: number, suffix = "admin", depth: AiStudyOverviewDepth = 1) {
  return `ai-study-${depth === 1 ? "overview" : "level3-overview"}-v${version}-${suffix}`;
}

export async function ensureAiStudyOverviewPromptProfile(depth: AiStudyOverviewDepth = 1) {
  const settings = profileSettings(depth);
  const existing = await prisma.aiStudyPromptProfile.findUnique({
    where: { key: settings.key }, include: { activeVersion: true }
  });
  if (existing?.activeVersion) return existing;
  return prisma.$transaction(async (tx) => {
    const profile = await tx.aiStudyPromptProfile.upsert({
      where: { key: settings.key },
      create: { key: settings.key, name: settings.name },
      update: {}
    });
    const latest = await tx.aiStudyPromptVersion.findFirst({
      where: { profileId: profile.id, publishedAt: { not: null } }, orderBy: { version: "desc" }
    });
    const active = latest || await tx.aiStudyPromptVersion.upsert({
      where: { profileId_version: { profileId: profile.id, version: 1 } },
      create: {
        profileId: profile.id, version: 1, sourceVersion: settings.seedSourceVersion,
        templates: settings.defaults as Prisma.InputJsonValue,
        changeNote: `${settings.label}内容概述默认Prompt`, publishedAt: new Date(), createdByName: "系统初始化"
      },
      update: {}
    });
    await tx.aiStudyPromptProfile.update({ where: { id: profile.id }, data: { activeVersionId: active.id } });
    return tx.aiStudyPromptProfile.findUniqueOrThrow({ where: { id: profile.id }, include: { activeVersion: true } });
  });
}

export async function getAiStudyOverviewPromptConfig(depth: AiStudyOverviewDepth = 1) {
  const profile = await ensureAiStudyOverviewPromptProfile(depth);
  const version = profile.activeVersion;
  if (!version) throw new Error(`${profileSettings(depth).label}内容概述没有已发布的Prompt版本。`);
  const templates = normalizeAiStudyOverviewPromptTemplates(version.templates);
  const error = validateAiStudyOverviewPromptTemplates(templates);
  if (error) throw new Error(`${profileSettings(depth).label}内容概述Prompt v${version.version} 无效：${error}`);
  return { id: version.id, sourceVersion: version.sourceVersion, templates };
}

export async function getAiStudyOverviewPromptProfileForAdmin(depth: AiStudyOverviewDepth = 1) {
  const profile = await ensureAiStudyOverviewPromptProfile(depth);
  return prisma.aiStudyPromptProfile.findUniqueOrThrow({
    where: { id: profile.id }, include: { activeVersion: true, versions: { orderBy: { version: "desc" } } }
  });
}
