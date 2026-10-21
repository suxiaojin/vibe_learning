import { readFile, writeFile } from "node:fs/promises";
import { prisma } from "../src/lib/prisma";
import { getAiServerConfigsForModule } from "../src/lib/ai-server-settings";
import { loadAiStudySourceChunksWithContent } from "../src/lib/ai-study-source-content";
import { generateChapterCurriculum, type ChapterCheckpoint } from "../src/lib/ai-study-chapter-curriculum";
import { assertCompleteFourLevelOutline } from "../src/lib/ai-study-outline-validation";
import { askQwenDetailed } from "../src/lib/qwen";

const projectArg = process.argv.find((arg) => arg.startsWith("--project="))?.slice("--project=".length);
const listOnly = process.argv.includes("--list");

async function main() {
  if (listOnly) {
    const projects = await prisma.aiStudyProject.findMany({
      where: { deletedAt: null, learningReadyAt: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, title: true, knowledgeCount: true, createdAt: true, sources: { select: { id: true } } }
    });
    const configs = await getAiServerConfigsForModule("ai_study_generation");
    const rows = await Promise.all(projects.map(async ({ sources, ...project }) => {
      const task = await prisma.aiStudyGenerationTask.findFirst({
        where: { projectId: project.id, type: "generate_outline", status: "succeeded" },
        orderBy: { finishedAt: "desc" },
        select: { inputSummary: true }
      });
      const binding = task?.inputSummary && typeof task.inputSummary === "object" && !Array.isArray(task.inputSummary)
        ? task.inputSummary as Record<string, unknown> : {};
      return { ...project, sourceCount: sources.length, assignedAiServerId: binding.assignedAiServerId ?? null, assignedAiModel: binding.assignedAiModel ?? null };
    }));
    console.log(JSON.stringify({ available: configs.map(({ id, model }) => ({ id, model })), projects: rows }));
    return;
  }
  if (!projectArg || !/^[a-z0-9_-]+$/i.test(projectArg)) throw new Error("Provide --project=<existing project ID> or --list.");
  const project = await prisma.aiStudyProject.findUnique({
    where: { id: projectArg },
    select: { id: true, title: true, deletedAt: true, learningReadyAt: true }
  });
  if (!project || project.deletedAt || !project.learningReadyAt) throw new Error("Project is unavailable or its original text and outline are not ready.");
  const sources = await loadAiStudySourceChunksWithContent(project.id);
  if (!sources.length) throw new Error("No parsed source chunks.");
  const existing = await prisma.aiStudyNode.findMany({
    where: { projectId: project.id },
    select: { title: true, depth: true, parentId: true },
    orderBy: { sortOrder: "asc" }
  });
  const configs = await getAiServerConfigsForModule("ai_study_generation");
  const outline = await prisma.aiStudyGenerationTask.findFirst({
    where: { projectId: project.id, type: "generate_outline", status: "succeeded" },
    orderBy: { finishedAt: "desc" },
    select: { inputSummary: true }
  });
  const binding = outline?.inputSummary && typeof outline.inputSummary === "object" && !Array.isArray(outline.inputSummary)
    ? outline.inputSummary as Record<string, unknown> : {};
  const recordedId = ["assignedAiServerId", "aiServerId", "serverId"].map((key) => binding[key]).find((value): value is string => typeof value === "string");
  const recordedModel = typeof binding.assignedAiModel === "string" ? binding.assignedAiModel : null;
  if (!recordedId || !recordedModel) throw new Error("The original outline task has no recorded model binding; choose a newer project for comparison.");
  const server = configs.find((config) => config.id === recordedId && config.model === recordedModel);
  if (!server) throw new Error("The original outline model is no longer selected in admin settings; refusing a different-model comparison.");
  const basePath = "/tmp/ai-study-strict-four-level-trial-" + project.id;
  const checkpointPath = basePath + ".checkpoint.json";
  let checkpoint: ChapterCheckpoint | undefined;
  try { checkpoint = JSON.parse(await readFile(checkpointPath, "utf8")) as ChapterCheckpoint; } catch { /* First trial. */ }
  let calls = 0;
  const started = Date.now();
  const curriculum = await generateChapterCurriculum({
    projectTitle: project.title,
    sources,
    safetyMaxNodes: 5000,
    checkpoint,
    saveCheckpoint: async (value) => { await writeFile(checkpointPath, JSON.stringify(value), "utf8"); },
    request: async (call) => {
      let lastError: Error | undefined;
      for (let attempt = 1; attempt <= 2; attempt++) {
        calls++;
        try {
          const messages = attempt === 1 ? call.messages : [
            ...call.messages,
            { role: "user" as const, content: "上次输出未通过校验：" + lastError?.message + "。请按Schema完整修正，不删减原文和知识点。" }
          ];
          const response = await askQwenDetailed(messages, {
            moduleKey: "ai_study_generation",
            serverConfig: server,
            jsonSchema: call.jsonSchema,
            maxCompletionTokens: call.maxCompletionTokens,
            temperature: 0.2,
            enableThinking: false,
            timeoutMs: 200_000
          });
          if (response.finishReason === "length") throw new Error("Model output reached the token limit.");
          call.validateContent(response.content);
          console.log(JSON.stringify({ stage: call.stage, attempt, status: "succeeded", model: server.model }));
          return response.content;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          console.log(JSON.stringify({ stage: call.stage, attempt, status: "failed", error: lastError.message }));
        }
      }
      throw lastError;
    }
  });
  assertCompleteFourLevelOutline(curriculum.nodes);
  const countByDepth = (nodes: { depth: number }[]) => [0, 1, 2, 3].map((depth) => nodes.filter((node) => node.depth === depth).length);
  const report = {
    projectId: project.id,
    title: project.title,
    model: server.model,
    serverId: server.id,
    sourceChunkCount: sources.length,
    modelCallCount: calls,
    durationMs: Date.now() - started,
    before: { counts: countByDepth(existing), level2: existing.filter((node) => node.depth === 1).map((node) => node.title), level3: existing.filter((node) => node.depth === 2).map((node) => node.title) },
    after: { counts: countByDepth(curriculum.nodes), level2: curriculum.nodes.filter((node) => node.depth === 1).map((node) => node.title), level3: curriculum.nodes.filter((node) => node.depth === 2).map((node) => node.title), level4: curriculum.nodes.filter((node) => node.depth === 3).map((node) => node.title) }
  };
  const outputPath = basePath + ".report.json";
  await writeFile(outputPath, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({ status: "completed", outputPath, countsBefore: report.before.counts, countsAfter: report.after.counts, modelCallCount: calls, durationMs: report.durationMs }));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); });
