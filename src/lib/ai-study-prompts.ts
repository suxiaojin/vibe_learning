import { readFile } from "fs/promises";
import path from "path";
import type { Prisma } from "@prisma/client";
import {
  aiStudyPromptTemplateKeys,
  normalizeAiStudyPromptTemplates,
  renderAiStudyPromptTemplate,
  validateAiStudyPromptTemplates,
  type AiStudyPromptTemplateKey,
  type AiStudyPromptTemplates,
  type AiStudyPromptVariables
} from "@/lib/ai-study-prompt-template";
import { prisma } from "@/lib/prisma";

const aiStudyPromptConfigPath = path.join(process.cwd(), "config", "ai-study-prompts.md");
const aiStudyPromptProfileKey = "global";

export type AiStudyPromptConfig = {
  id: string;
  version: string;
  versionNumber: number;
  render: (key: AiStudyPromptTemplateKey, variables?: AiStudyPromptVariables) => string;
};

export async function getAiStudyPromptConfig(versionId?: string | null): Promise<AiStudyPromptConfig> {
  const profile = await ensureAiStudyPromptProfile();
  const version = versionId
    ? await prisma.aiStudyPromptVersion.findFirst({ where: { id: versionId, profileId: profile.id, publishedAt: { not: null } } })
    : profile.activeVersion;

  if (!version) {
    throw new Error("AI 学习搭子没有已发布的提示词版本。");
  }

  const templates = normalizeAiStudyPromptTemplates(version.templates);
  const validationError = validateAiStudyPromptTemplates(templates);
  if (validationError) {
    throw new Error(`AI 学习搭子提示词版本 v${version.version} 无效：${validationError}`);
  }

  return {
    id: version.id,
    version: version.sourceVersion,
    versionNumber: version.version,
    render(key, variables = {}) {
      return renderAiStudyPromptTemplate(templates[key], variables);
    }
  };
}

export async function ensureAiStudyPromptProfile() {
  const existing = await prisma.aiStudyPromptProfile.findUnique({
    where: { key: aiStudyPromptProfileKey },
    include: { activeVersion: true }
  });
  if (existing?.activeVersion) {
    return existing;
  }

  const seed = await readAiStudyPromptSeed();
  return prisma.$transaction(async (tx) => {
    const profile = await tx.aiStudyPromptProfile.upsert({
      where: { key: aiStudyPromptProfileKey },
      create: { key: aiStudyPromptProfileKey, name: "学习搭子 Prompt" },
      update: {}
    });
    const active = await tx.aiStudyPromptVersion.findFirst({
      where: { profileId: profile.id, publishedAt: { not: null } },
      orderBy: { version: "desc" }
    });
    const seedVersion = active || await tx.aiStudyPromptVersion.upsert({
      where: { profileId_version: { profileId: profile.id, version: seed.versionNumber } },
      create: {
        profileId: profile.id,
        version: seed.versionNumber,
        sourceVersion: seed.sourceVersion,
        templates: seed.templates as Prisma.InputJsonValue,
        changeNote: "从 config/ai-study-prompts.md 导入当前线上基线",
        publishedAt: new Date(),
        createdByName: "系统初始化"
      },
      update: {
        sourceVersion: seed.sourceVersion,
        templates: seed.templates as Prisma.InputJsonValue,
        changeNote: "从 config/ai-study-prompts.md 恢复当前线上基线",
        publishedAt: new Date(),
        createdByName: "系统初始化"
      }
    });
    await tx.aiStudyPromptProfile.update({
      where: { id: profile.id },
      data: { activeVersionId: seedVersion.id }
    });
    return tx.aiStudyPromptProfile.findUniqueOrThrow({
      where: { id: profile.id },
      include: { activeVersion: true }
    });
  });
}

export async function getAiStudyPromptProfileForAdmin() {
  const profile = await ensureAiStudyPromptProfile();
  return prisma.aiStudyPromptProfile.findUniqueOrThrow({
    where: { id: profile.id },
    include: { activeVersion: true, versions: { orderBy: { version: "desc" } } }
  });
}

export async function readAiStudyPromptSeed() {
  const content = await readFile(aiStudyPromptConfigPath, "utf8").catch(() => "");
  if (!content.trim()) {
    throw new Error(`AI 学习搭子提示词配置文件不存在或为空：${aiStudyPromptConfigPath}`);
  }

  const sections = parseAiStudyPromptSections(content);
  const sourceVersion = sections.get("prompt.version")?.trim() || "";
  const templates = normalizeAiStudyPromptTemplates(Object.fromEntries(aiStudyPromptTemplateKeys.map((key) => [key, sections.get(key) || ""])));
  const validationError = validateAiStudyPromptTemplates(templates);
  if (!sourceVersion || validationError) {
    throw new Error(`AI 学习搭子提示词配置无效：${!sourceVersion ? "缺少 prompt.version。" : validationError}`);
  }

  const versionNumber = Number(sourceVersion.match(/ai-study-v(\d+)/)?.[1] || 1);
  return { sourceVersion, versionNumber, templates };
}

function parseAiStudyPromptSections(content: string) {
  const sections = new Map<string, string>();
  const sectionPattern =
    /<!--\s*ai-study-prompt:([a-zA-Z0-9_.-]+)\s*-->\r?\n?([\s\S]*?)\r?\n?<!--\s*\/ai-study-prompt\s*-->/g;

  for (const match of content.matchAll(sectionPattern)) {
    sections.set(match[1].trim(), match[2].trim());
  }
  return sections;
}

export function buildAiStudyPromptSourceVersion(version: number, suffix = "admin") {
  return `ai-study-v${version}-${suffix}`;
}

export type { AiStudyPromptTemplateKey, AiStudyPromptTemplates };
