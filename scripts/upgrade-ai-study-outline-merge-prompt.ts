import { Prisma, PrismaClient } from "@prisma/client";
import { readAiStudyPromptSeed, type AiStudyPromptTemplateKey } from "../src/lib/ai-study-prompts";
import { normalizeAiStudyPromptTemplates, validateAiStudyPromptTemplates } from "../src/lib/ai-study-prompt-template";

// Default is read-only. Publish only after inspecting the preview and confirming
// the exact active version; never overwrite published prompt history or projects.
const prisma = new PrismaClient();
async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const expectedId = args.find((arg) => arg.startsWith("--expected-active-version="))?.split("=")[1];
  if (args.some((arg) => arg !== "--apply" && !arg.startsWith("--expected-active-version="))) {
    throw new Error("仅支持 --apply 和 --expected-active-version=<id>。");
  }
  if (apply && !expectedId) throw new Error("发布必须指定预览中确认的 --expected-active-version=<id>。");
  const profile = await prisma.aiStudyPromptProfile.findUnique({ where: { key: "global" }, include: { activeVersion: true } });
  const active = profile?.activeVersion;
  if (!profile || !active?.publishedAt) throw new Error("没有可复制的已发布学习搭子 Prompt。");
  if (expectedId && active.id !== expectedId) throw new Error("当前生效版本已变化，请重新预览。");
  const oldTemplates = normalizeAiStudyPromptTemplates(active.templates);
  const seed = await readAiStudyPromptSeed();
  const keys: AiStudyPromptTemplateKey[] = ["outline.partial.system", "outline.partial.user", "outline.merge.system", "outline.merge.user", "card.system", "card.user", "card.instruction.level4"];
  const updates = Object.fromEntries(keys.map((key) => [key, seed.templates[key]]));
  const templates = { ...oldTemplates, ...updates };
  const validationError = validateAiStudyPromptTemplates(templates);
  if (validationError) throw new Error(validationError);
  const changedKeys = Object.keys(templates).filter((key) => templates[key as keyof typeof templates] !== oldTemplates[key as keyof typeof oldTemplates]);
  console.log(JSON.stringify({ mode: apply ? "apply" : "preview", activeVersionId: active.id, activeVersion: active.version, changedKeys, existingProjectsUnchanged: true }, null, 2));
  if (changedKeys.length === 0) return;
  if (!apply) {
    console.log(JSON.stringify(updates, null, 2));
    return;
  }
  const published = await prisma.$transaction(async (tx) => {
    const current = await tx.aiStudyPromptProfile.findUniqueOrThrow({ where: { id: profile.id } });
    if (current.activeVersionId !== active.id) throw new Error("发布期间生效版本发生变化，已取消。");
    const latest = await tx.aiStudyPromptVersion.aggregate({ where: { profileId: profile.id }, _max: { version: true } });
    const version = (latest._max.version ?? 0) + 1;
    const next = await tx.aiStudyPromptVersion.create({ data: {
      profileId: profile.id,
      version,
      sourceVersion: `ai-study-v${version}-evidence-curriculum-2026-10-18`,
      templates: templates as Prisma.InputJsonValue,
      changeNote: "逐段证据规划、完整学习目录及逐目标讲解；保留聊天模板、其它模板与历史版本",
      publishedAt: new Date(),
      createdByName: "系统修复"
    } });
    const switched = await tx.aiStudyPromptProfile.updateMany({ where: { id: profile.id, activeVersionId: active.id }, data: { activeVersionId: next.id } });
    if (switched.count !== 1) throw new Error("生效版本发生变化，事务已取消。");
    return { id: next.id, version: next.version, sourceVersion: next.sourceVersion };
  });
  console.log(JSON.stringify({ published }, null, 2));
}
main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
