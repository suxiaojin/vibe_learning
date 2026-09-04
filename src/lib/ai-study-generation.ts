import { z } from "zod";
import crypto from "crypto";
import type { AiStudyGenerationTask, AiStudyNode, Prisma } from "@prisma/client";
import { markAiStudyTaskFailed, markAiStudyTaskSucceeded } from "@/lib/ai-study";
import {
  ackAiStudyQueuedTask,
  aiStudyQueueTaskTypes,
  claimStaleAiStudyQueuedTaskEntries,
  enqueueAiStudyTask,
  isAiStudyTaskQueueConfigured,
  isSupportedAiStudyTaskType,
  readAiStudyQueuedTaskEntries,
  type AiStudyQueuedTaskEntry
} from "@/lib/ai-study-task-queue";
import { askQwen, askQwenDetailed, type ChatMessage, type QwenJsonSchema } from "@/lib/qwen";
import { prisma } from "@/lib/prisma";
import { downloadAiStudyObject, uploadAiStudyObject } from "@/lib/ai-study-storage";
import { refreshAiStudyProgressCache, writeAiStudyTaskProgressCache } from "@/lib/ai-study-progress-cache";
import { assertCompleteFourLevelOutline } from "@/lib/ai-study-outline-validation";
import {
  buildOutlineCandidateJsonSchema,
  buildNestedOutlineJsonSchema,
  flattenNestedOutline,
  nestedOutlineSchema,
  outlineCandidateListSchema,
  type NestedOutline,
  type OutlineCandidate
} from "@/lib/ai-study-outline-contract";
import { getAiStudyPromptConfig, type AiStudyPromptConfig } from "@/lib/ai-study-prompts";
import { parsePdfWithMineru, type MineruContentBlock, type MineruParseResult } from "@/lib/ai-study-mineru";
import {
  formatAiStudySourceBlockContent,
  loadAiStudySourceChunksWithContent,
  type AiStudySourceChunkWithContent
} from "@/lib/ai-study-source-content";

const outlineTimeoutMs = Number(process.env.AI_STUDY_OUTLINE_TIMEOUT_MS || 200_000);
const cardTimeoutMs = Number(process.env.AI_STUDY_CARD_TIMEOUT_MS || 120_000);
const maxNodesPerProject = Number(process.env.AI_STUDY_MAX_NODES_PER_PROJECT || 60);
const maxSourceChunks = Number(process.env.AI_STUDY_MAX_SOURCE_CHUNKS || 5_000);
const modelBatchChars = Number(process.env.AI_STUDY_MODEL_BATCH_CHARS || 24_000);
const outlinePartialMaxTokens = Number(process.env.AI_STUDY_OUTLINE_PARTIAL_MAX_TOKENS || 8_192);
const outlineMergeMaxTokens = Number(process.env.AI_STUDY_OUTLINE_MERGE_MAX_TOKENS || 16_384);
const cardMaxTokens = Number(process.env.AI_STUDY_CARD_MAX_TOKENS || 8_192);
const structuredJsonMaxAttempts = Math.max(1, Number(process.env.AI_STUDY_JSON_MAX_ATTEMPTS || 2));
const queueFallbackScanMs = Number(process.env.AI_STUDY_QUEUE_FALLBACK_SCAN_MS || 60_000);
const promptItemSeparator = "\n\n---\n\n";
let lastQueueFallbackScanAt = 0;

const outlineNodeSchema = z.object({
  clientId: z.string().trim().min(1).max(80),
  parentClientId: z.string().trim().min(1).max(80).nullable().optional(),
  title: z.string().trim().min(1).max(80),
  summary: z.string().trim().min(1).max(600),
  sourceChunkIds: z.array(z.string().trim().min(1)).min(1).max(5000)
});

const cardSchema = z.object({
  overview: z.string().trim().min(1).max(1200),
  explanation: z.string().trim().max(5000).default(""),
  keyPoints: z.array(z.string().trim().min(1).max(240)).max(10).default([]),
  pitfalls: z.array(z.string().trim().min(1).max(240)).max(6).default([]),
  examples: z.array(z.string().trim().min(1).max(500)).max(5).default([]),
  flashcards: z.array(z.object({
    front: z.string().trim().min(1).max(200),
    back: z.string().trim().min(1).max(500)
  })).max(0).default([])
});

const cardJsonSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["overview", "explanation", "keyPoints", "pitfalls", "examples", "flashcards"],
  properties: {
    overview: { type: "string", minLength: 1, maxLength: 1200 },
    explanation: { type: "string", maxLength: 5000 },
    keyPoints: {
      type: "array",
      maxItems: 10,
      items: { type: "string", minLength: 1, maxLength: 240 }
    },
    pitfalls: {
      type: "array",
      maxItems: 6,
      items: { type: "string", minLength: 1, maxLength: 240 }
    },
    examples: {
      type: "array",
      maxItems: 5,
      items: { type: "string", minLength: 1, maxLength: 500 }
    },
    flashcards: {
      type: "array",
      maxItems: 0,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["front", "back"],
        properties: {
          front: { type: "string", minLength: 1, maxLength: 200 },
          back: { type: "string", minLength: 1, maxLength: 500 }
        }
      }
    }
  }
};

type OutlineNode = z.infer<typeof outlineNodeSchema> & {
  depth: number;
  sortOrder: number;
};

type GeneratedCard = z.infer<typeof cardSchema> & {
  nodeId: string;
};

type SupportedParsedSourceType = "pdf";

type PersistedMineruBlock = {
  id: string;
  projectId: string;
  sourceId: string;
  pageNumber: number;
  blockIndex: number;
  blockType: string;
  readingOrder: number;
  bbox: Prisma.InputJsonValue | undefined;
  textContent: string | null;
  latexContent: string | null;
  assetKey: string | null;
  headingPath: string[];
  confidence: number | null;
  parserBlockId: string | null;
};

type SemanticChunk = {
  pageStart: number;
  pageEnd: number;
  chunkIndex: number;
  chunkType: string;
  content: string;
  sourceBlockIds: string[];
  tokenCount: number;
  contentHash: string;
};

export async function runAiStudyWorkerCycle(batchSize = Number(process.env.AI_STUDY_WORKER_BATCH_SIZE || 1)) {
  const normalizedBatchSize = Math.max(1, batchSize);
  if (isAiStudyTaskQueueConfigured()) {
    const entries = await readAiStudyQueuedTaskEntries(normalizedBatchSize);
    if (entries.length > 0) {
      return processQueuedAiStudyEntries(entries);
    }

    const staleEntries = await claimStaleAiStudyQueuedTaskEntries(normalizedBatchSize);
    if (staleEntries.length > 0) {
      return processQueuedAiStudyEntries(staleEntries);
    }

    if (!shouldRunQueueFallbackScan()) {
      return { processed: 0 };
    }
  }

  return runPostgresFallbackCycle(normalizedBatchSize);
}

async function processQueuedAiStudyEntries(entries: AiStudyQueuedTaskEntry[]) {
  let processed = 0;
  for (const entry of entries) {
    if (await claimAndProcessAiStudyTask(entry.taskId)) {
      processed += 1;
    }
    await ackAiStudyQueuedTask(entry.entryId);
  }

  return { processed };
}

async function runPostgresFallbackCycle(batchSize: number) {
  const tasks = await prisma.aiStudyGenerationTask.findMany({
    where: {
      status: "pending",
      type: {
        in: [...aiStudyQueueTaskTypes]
      }
    },
    orderBy: { createdAt: "asc" },
    take: batchSize
  });

  let processed = 0;
  for (const task of tasks) {
    if (await claimAndProcessAiStudyTask(task.id)) {
      processed += 1;
    }
  }

  return { processed };
}

async function claimAndProcessAiStudyTask(taskId: string) {
  const task = await prisma.aiStudyGenerationTask.findUnique({
    where: { id: taskId }
  });

  if (!task || task.status !== "pending" || !isSupportedAiStudyTaskType(task.type)) {
    return false;
  }

  const claimed = await prisma.aiStudyGenerationTask.updateMany({
    where: {
      id: task.id,
      status: "pending"
    },
    data: {
      status: "running",
      stage: "claimed",
      startedAt: new Date(),
      finishedAt: null,
      errorMessage: null
    }
  });

  if (claimed.count === 0) {
    return false;
  }

  await writeAiStudyTaskProgressCache({
    ...task,
    status: "running",
    stage: "claimed",
    errorMessage: null,
    updatedAt: new Date()
  });

  try {
    await processAiStudyTask(task.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI 学习搭子任务执行失败。";
    await markAiStudyTaskFailed(task.id, message, "failed");
    if (task.type === "parse_source" && task.sourceId) {
      await prisma.aiStudySource.updateMany({
        where: { id: task.sourceId },
        data: { status: "failed" }
      });
    }
    await prisma.aiStudyProject.updateMany({
      where: { id: task.projectId },
      data: { status: "failed" }
    });
    await refreshAiStudyProgressCache(task.projectId);
  }

  return true;
}

function shouldRunQueueFallbackScan() {
  const now = Date.now();
  if (now - lastQueueFallbackScanAt < queueFallbackScanMs) {
    return false;
  }

  lastQueueFallbackScanAt = now;
  return true;
}

async function processAiStudyTask(taskId: string) {
  const task = await prisma.aiStudyGenerationTask.findUnique({
    where: { id: taskId }
  });
  if (!task) {
    return;
  }

  if (task.type === "generate_outline") {
    await generateOutline(task);
    return;
  }

  if (task.type === "parse_source") {
    await parseSource(task);
    return;
  }

  if (task.type === "generate_cards") {
    await generateCards(task);
    return;
  }
}

async function parseSource(task: AiStudyGenerationTask) {
  if (!task.sourceId) {
    throw new Error("解析任务缺少 sourceId。");
  }

  const source = await prisma.aiStudySource.findUnique({
    where: { id: task.sourceId },
    include: {
      project: true
    }
  });

  if (!source || source.project.deletedAt) {
    throw new Error("资料源不存在或项目已删除。");
  }
  if (!isSupportedParsedSourceType(source.sourceType)) {
    throw new Error(`学习搭子仅支持由 MinerU 解析 PDF，收到 ${source.sourceType}。`);
  }
  if (!source.storageKey) {
    throw new Error("学习资料缺少 MinIO storageKey。");
  }

  await updateAiStudyTaskStage(task, "downloading_source");

  const object = await downloadAiStudyObject(source.storageKey);

  await updateAiStudyTaskStage(task, "submitting_to_mineru");

  const parsed = await parseAndPersistMineruArtifacts({
    body: object.body,
    fileName: source.fileName || "learning-material.pdf",
    projectId: source.projectId,
    sourceId: source.id
  });
  const chunks = parsed.chunks;

  if (chunks.length === 0) {
    throw new Error("学习资料未解析出可学习文本。");
  }

  let nextTask: AiStudyGenerationTask | null = null;
  await prisma.$transaction(async (tx) => {
    await tx.aiStudySourceChunk.deleteMany({ where: { sourceId: source.id } });
    await tx.aiStudySourceBlock.deleteMany({ where: { sourceId: source.id } });
    if (parsed.blocks.length > 0) {
      await tx.aiStudySourceBlock.createMany({
        data: parsed.blocks.map(({ headingPath: _headingPath, ...block }) => block)
      });
    }
    await tx.aiStudySourceChunk.createMany({
      data: chunks.map(({ content: _content, ...chunk }) => ({
        projectId: source.projectId,
        sourceId: source.id,
        ...chunk
      }))
    });

    await tx.aiStudySource.update({
      where: { id: source.id },
      data: {
        pageCount: parsed.pageCount,
        parserVersion: parsed.parserVersion,
        parseBackend: parsed.parseBackend,
        sourceSha256: parsed.sourceSha256,
        parseManifestKey: parsed.parseManifestKey,
        parseContentListKey: parsed.parseContentListKey,
        parseMarkdownKey: parsed.parseMarkdownKey,
        parsedPageCount: parsed.pageCount,
        failedPageCount: parsed.failedPageCount,
        parseWarnings: parsed.parseWarnings,
        status: "parsed"
      }
    });

    await tx.aiStudyGenerationTask.update({
      where: { id: task.id },
      data: {
        status: "succeeded",
        stage: "mineru_result_persisted",
        outputSummary: {
          sourceType: source.sourceType,
          pageCount: parsed.pageCount,
          chunkCount: chunks.length,
          blockCount: parsed.blocks.length,
          textLength: chunks.reduce((total, chunk) => total + chunk.content.length, 0),
          parserVersion: parsed.parserVersion,
          parseBackend: parsed.parseBackend,
          imageFallbackAnalysisCount: parsed.imageFallbackAnalysisCount,
          warningCount: parsed.warningCount
        },
        finishedAt: new Date(),
        errorMessage: null
      }
    });

    nextTask = await tx.aiStudyGenerationTask.create({
      data: {
        projectId: source.projectId,
        sourceId: source.id,
        type: "generate_outline",
        stage: "waiting_for_ai_generation",
        inputSummary: {
          sourceType: source.sourceType,
          chunkCount: chunks.length,
          blockCount: parsed.blocks.length
        }
      }
    });

    await tx.aiStudyProject.update({
      where: { id: source.projectId },
      data: { status: "processing" }
    });
  });

  await refreshAiStudyProgressCache(source.projectId);
  await enqueueAiStudyTask(nextTask);
}

async function parseAndPersistMineruArtifacts(input: {
  body: Buffer;
  fileName: string;
  projectId: string;
  sourceId: string;
}) {
  const result = await parsePdfWithMineru({ body: input.body, fileName: input.fileName });
  const artifactPrefix = `ai-study/${input.projectId}/${input.sourceId}/mineru`;
  const parseMarkdownKey = `${artifactPrefix}/document.md`;
  const parseContentListKey = `${artifactPrefix}/content-list.json`;
  const middleJsonKey = `${artifactPrefix}/middle.json`;
  const parseManifestKey = `${artifactPrefix}/manifest.json`;

  await Promise.all([
    uploadAiStudyObject({ key: parseMarkdownKey, body: Buffer.from(result.markdown, "utf8"), contentType: "text/markdown; charset=utf-8" }),
    uploadAiStudyObject({ key: parseContentListKey, body: Buffer.from(JSON.stringify(result.contentList), "utf8"), contentType: "application/json" }),
    uploadAiStudyObject({ key: middleJsonKey, body: Buffer.from(JSON.stringify(result.middleJson), "utf8"), contentType: "application/json" })
  ]);

  const assetKeyByMineruPath = new Map<string, string>();
  await Promise.all(Object.entries(result.images).map(async ([mineruPath, body]) => {
    const normalizedPath = normalizeMineruAssetPath(mineruPath);
    const key = `${artifactPrefix}/images/${normalizedPath.split("/").pop() || crypto.randomUUID()}`;
    await uploadAiStudyObject({ key, body, contentType: inferImageContentType(key) });
    assetKeyByMineruPath.set(normalizedPath, key);
    assetKeyByMineruPath.set(normalizedPath.split("/").pop() || normalizedPath, key);
  }));

  const blocks = buildPersistedMineruBlocks(result, input.projectId, input.sourceId, assetKeyByMineruPath);
  const chunks = buildMineruSemanticChunks(blocks);
  if (chunks.length === 0) {
    throw new Error("MinerU 结果中没有可用于学习的正文、公式、表格或图片内容。");
  }
  if (chunks.length > maxSourceChunks) {
    throw new Error(`MinerU 解析产生 ${chunks.length} 个语义片段，超过单项目上限 ${maxSourceChunks}。`);
  }

  const manifest = {
    parser: "mineru",
    parserVersion: result.version,
    backend: result.backend,
    sourceSha256: result.sourceSha256,
    pageCount: result.pageCount,
    blockCount: blocks.length,
    chunkCount: chunks.length,
    imageFallbackAnalysisCount: result.imageFallbackAnalysisCount,
    warnings: result.warnings,
    artifacts: {
      markdown: parseMarkdownKey,
      contentList: parseContentListKey,
      middleJson: middleJsonKey,
      images: Array.from(new Set(assetKeyByMineruPath.values()))
    }
  };
  await uploadAiStudyObject({
    key: parseManifestKey,
    body: Buffer.from(JSON.stringify(manifest), "utf8"),
    contentType: "application/json"
  });

  return {
    pageCount: result.pageCount,
    parserVersion: result.version,
    parseBackend: result.backend,
    sourceSha256: result.sourceSha256,
    parseManifestKey,
    parseContentListKey,
    parseMarkdownKey,
    failedPageCount: 0,
    parseWarnings: result.warnings as Prisma.InputJsonValue,
    imageFallbackAnalysisCount: result.imageFallbackAnalysisCount,
    warningCount: result.warnings.length,
    blocks,
    chunks
  };
}

function buildPersistedMineruBlocks(
  result: MineruParseResult,
  projectId: string,
  sourceId: string,
  assetKeyByMineruPath: Map<string, string>
) {
  const headingPath: string[] = [];
  return result.contentList.map((block, blockIndex): PersistedMineruBlock => {
    const blockType = String(block.type || "unknown");
    const latexContent = readMineruLatex(block);
    const textContent = blockType === "equation" && latexContent ? "" : readMineruBlockText(block);
    const headingLevel = readMineruHeadingLevel(block);
    if (headingLevel !== null && textContent) {
      headingPath.splice(Math.max(0, headingLevel - 1));
      headingPath[Math.max(0, headingLevel - 1)] = textContent;
    }
    const imagePath = typeof block.img_path === "string"
      ? block.img_path
      : typeof block.image_path === "string" ? block.image_path : "";
    const normalizedImagePath = normalizeMineruAssetPath(imagePath);
    const pageIndex = typeof block.page_idx === "number"
      ? block.page_idx
      : typeof block.page_index === "number" ? block.page_index : 0;
    const confidence = typeof block.score === "number"
      ? block.score
      : typeof block.confidence === "number" ? block.confidence : null;

    return {
      id: crypto.randomUUID(),
      projectId,
      sourceId,
      pageNumber: pageIndex + 1,
      blockIndex,
      blockType,
      readingOrder: blockIndex,
      bbox: toJsonValue(block.bbox),
      textContent: textContent || null,
      latexContent,
      assetKey: assetKeyByMineruPath.get(normalizedImagePath)
        || assetKeyByMineruPath.get(normalizedImagePath.split("/").pop() || "")
        || null,
      headingPath: [...headingPath],
      confidence,
      parserBlockId: typeof block.id === "string" ? block.id : null
    };
  }).filter((block) => !isNonLearningMineruBlock(block.blockType)
    && Boolean(block.textContent || block.latexContent || block.assetKey));
}

export function buildMineruSemanticChunks(blocks: PersistedMineruBlock[]) {
  const chunks: SemanticChunk[] = [];
  const duplicateChunkByKey = new Map<string, SemanticChunk>();
  let current: PersistedMineruBlock[] = [];
  let currentText: string[] = [];
  let currentHeading = "";
  let currentChunkType = "text";
  const maxChunkChars = 4_000;

  function resetCurrent() {
    current = [];
    currentText = [];
    currentChunkType = "text";
  }

  function flush() {
    const content = normalizeParsedText(Array.from(new Set(currentText)).join("\n\n"));
    if (!content || current.length === 0) {
      resetCurrent();
      return;
    }
    const pageStart = Math.min(...current.map((block) => block.pageNumber));
    const pageEnd = Math.max(...current.map((block) => block.pageNumber));
    const contentHash = crypto.createHash("sha256").update(content).digest("hex");
    const duplicateKey = `${currentChunkType}\u0000${contentHash}`;
    const duplicate = duplicateChunkByKey.get(duplicateKey);
    if (duplicate) {
      duplicate.pageStart = Math.min(duplicate.pageStart || pageStart, pageStart);
      duplicate.pageEnd = Math.max(duplicate.pageEnd || pageEnd, pageEnd);
      duplicate.sourceBlockIds.push(...current.map((block) => block.id));
      resetCurrent();
      return;
    }

    const chunk: SemanticChunk = {
      pageStart,
      pageEnd,
      chunkIndex: chunks.length,
      chunkType: currentChunkType,
      content,
      sourceBlockIds: current.map((block) => block.id),
      tokenCount: estimateTokenCount(content),
      contentHash
    };
    chunks.push(chunk);
    duplicateChunkByKey.set(duplicateKey, chunk);
    resetCurrent();
  }

  for (const block of blocks) {
    const content = formatAiStudySourceBlockContent(block);
    if (!content || isNonLearningMineruBlock(block.blockType)) {
      continue;
    }
    const headingKey = JSON.stringify(block.headingPath);
    const typedChunk = ["equation", "table", "image", "chart", "code", "list"].includes(block.blockType)
      ? block.blockType
      : "text";
    const standalone = ["equation", "table", "image", "chart"].includes(block.blockType);
    if (current.length > 0 && (
      headingKey !== currentHeading
      || typedChunk !== currentChunkType
      || currentText.join("\n\n").length + content.length > maxChunkChars
    )) {
      flush();
    }
    currentHeading = headingKey;
    currentChunkType = typedChunk;
    current.push(block);
    currentText.push(content);
    if (standalone) {
      flush();
    }
  }
  flush();
  return chunks;
}

function readMineruBlockText(block: MineruContentBlock) {
  const listText = readMineruListItems(block.list_items);
  const values = [
    block.text,
    block.content,
    block.table_body,
    block.table_caption,
    block.table_footnote,
    block.image_caption,
    block.image_footnote,
    block.chart_caption,
    block.chart_footnote,
    block.code_caption,
    block.code_body,
    listText
  ]
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
    .map((value) => normalizeParsedText(value));
  return normalizeParsedText(Array.from(new Set(values)).join("\n"));
}

function readMineruListItems(value: unknown): string {
  const items = flattenMineruListItems(value);
  return items.map((item) => /^\s*(?:[-*+] |\d+[.)] )/.test(item) ? item : `- ${item}`).join("\n");
}

function flattenMineruListItems(value: unknown): string[] {
  if (typeof value === "string") {
    return value.trim() ? [value.trim()] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap(flattenMineruListItems);
  }
  if (value && typeof value === "object") {
    const item = value as Record<string, unknown>;
    return [item.text, item.content, item.list_items].flatMap(flattenMineruListItems);
  }
  return [];
}

function readMineruLatex(block: MineruContentBlock) {
  for (const key of ["latex", "text"]) {
    const value = block[key];
    if (typeof value === "string" && block.type === "equation") {
      return value.replace(/^\$\$?|\$\$?$/g, "").trim() || null;
    }
  }
  return null;
}

function readMineruHeadingLevel(block: MineruContentBlock) {
  if (!["header", "title"].includes(String(block.type || ""))) {
    return null;
  }
  return typeof block.text_level === "number" ? Math.max(1, Math.min(block.text_level, 6)) : 1;
}

function isNonLearningMineruBlock(blockType: string) {
  return ["page_number", "footer", "discarded"].includes(blockType);
}

function normalizeMineruAssetPath(value: string) {
  return value.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
}

function inferImageContentType(key: string) {
  const extension = key.split(".").pop()?.toLowerCase();
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "gif") return "image/gif";
  return "image/jpeg";
}

function estimateTokenCount(content: string) {
  return Math.max(1, Math.ceil(content.length / 2));
}

function toJsonValue(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function isSupportedParsedSourceType(sourceType: string): sourceType is SupportedParsedSourceType {
  return sourceType === "pdf";
}

async function generateOutline(task: AiStudyGenerationTask) {
  const project = await prisma.aiStudyProject.findUnique({
    where: { id: task.projectId }
  });

  if (!project || project.deletedAt) {
    throw new Error("学习项目不存在或已删除。");
  }
  const sourceChunks = await loadAiStudySourceChunksWithContent(project.id);
  if (sourceChunks.length === 0) {
    throw new Error("学习项目没有可生成的原文片段。");
  }

  await updateAiStudyTaskStage(task, "generating_outline");

  const promptConfig = await getAiStudyPromptConfig(project.aiPromptVersionId);
  const promptVersion = promptConfig.version;
  const outline = await generateCompleteOutline(task, project.title, sourceChunks, promptConfig);
  const preparedNodes = prepareOutlineNodes(outline.nodes, sourceChunks, project.title);
  const finalOutputSummary = await buildFinalTaskOutputSummary(task.id, {
    nodeCount: preparedNodes.length,
    promptVersion,
    outlineCheckpoint: null
  });

  let nextTask: AiStudyGenerationTask | null = null;
  await prisma.$transaction(async (tx) => {
    await tx.aiStudyProgress.deleteMany({ where: { projectId: project.id } });
    await tx.aiStudyCard.deleteMany({ where: { projectId: project.id } });
    await tx.aiStudyNode.deleteMany({ where: { projectId: project.id } });

    const nodeIdByClientId = new Map<string, string>();
    for (const node of preparedNodes) {
      const created = await tx.aiStudyNode.create({
        data: {
          projectId: project.id,
          parentId: node.parentClientId ? nodeIdByClientId.get(node.parentClientId) || null : null,
          title: node.title,
          summary: node.summary,
          sortOrder: node.sortOrder,
          depth: node.depth,
          sourceChunkIds: node.sourceChunkIds,
          status: "ready"
        }
      });
      nodeIdByClientId.set(node.clientId, created.id);

      await tx.aiStudyProgress.create({
        data: {
          userId: project.ownerId,
          projectId: project.id,
          nodeId: created.id,
          status: "not_started"
        }
      });
    }

    await tx.aiStudyGenerationTask.update({
      where: { id: task.id },
      data: {
        status: "succeeded",
        stage: "outline_generated",
        outputSummary: finalOutputSummary,
        finishedAt: new Date(),
        errorMessage: null
      }
    });

    nextTask = await tx.aiStudyGenerationTask.create({
      data: {
        projectId: project.id,
        type: "generate_cards",
        stage: "waiting_for_card_generation",
        inputSummary: {
          nodeCount: preparedNodes.length,
          promptVersion
        }
      }
    });

    await tx.aiStudyProject.update({
      where: { id: project.id },
      data: {
        aiPromptVersionId: project.aiPromptVersionId || promptConfig.id,
        status: "processing",
        knowledgeCount: preparedNodes.length,
        masteredCount: 0
      }
    });
  });

  await refreshAiStudyProgressCache(project.id);
  await enqueueAiStudyTask(nextTask);
}

async function generateCards(task: AiStudyGenerationTask) {
  const project = await prisma.aiStudyProject.findUnique({
    where: { id: task.projectId },
    include: {
      nodes: {
        where: { status: "ready" },
        orderBy: [{ depth: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
        include: { cards: true }
      }
    }
  });

  if (!project || project.deletedAt) {
    throw new Error("学习项目不存在或已删除。");
  }
  const sourceChunks = await loadAiStudySourceChunksWithContent(project.id);
  if (sourceChunks.length === 0) {
    throw new Error("学习项目没有可生成的原文片段。");
  }

  const nodes = project.nodes.filter((node) => node.cards.length === 0);
  const promptConfig = await getAiStudyPromptConfig(project.aiPromptVersionId);
  const promptVersion = promptConfig.version;
  if (nodes.length === 0) {
    await markAiStudyTaskSucceeded(task.id, { cardCount: 0, promptVersion });
    await prisma.aiStudyProject.update({
      where: { id: project.id },
      data: { aiPromptVersionId: project.aiPromptVersionId || promptConfig.id, status: "ready" }
    });
    await refreshAiStudyProgressCache(project.id);
    return;
  }

  const chunksById = new Map(sourceChunks.map((chunk) => [chunk.id, chunk]));
  const generatedCards: GeneratedCard[] = [];

  for (const [index, node] of nodes.entries()) {
    const nodeSourceChunks = node.depth === 0 ? sourceChunks : getNodeSourceChunks(node, chunksById);
    const sourceContext = await buildCompleteCardEvidence(project.title, node, nodeSourceChunks, promptConfig);
    const cardMessages = buildCardMessages(project.title, node, sourceContext, promptConfig);
    const card = await requestValidatedJsonWithRetry({
      task,
      stage: `generating_card_${index + 1}_of_${nodes.length}`,
      messages: cardMessages,
      retryMessages: buildCardRetryMessages(cardMessages),
      schema: cardSchema,
      jsonSchema: { name: "ai_study_card", schema: cardJsonSchema },
      relaxedJsonRetry: true,
      maxCompletionTokens: cardMaxTokens,
      timeoutMs: cardTimeoutMs,
      temperature: 0.2,
      invalidMessage: `知识卡片 JSON 格式不合法：${node.title}`,
      parseResponse: (responseText) => parseGeneratedCard(responseText, node)
    });
    generatedCards.push({
      nodeId: node.id,
      overview: card.overview,
      explanation: card.explanation ?? "",
      keyPoints: card.keyPoints ?? [],
      pitfalls: card.pitfalls ?? [],
      examples: card.examples ?? [],
      flashcards: card.flashcards ?? []
    });
  }

  const finalOutputSummary = await buildFinalTaskOutputSummary(task.id, {
    cardCount: generatedCards.length,
    promptVersion
  });

  await prisma.$transaction(async (tx) => {
    for (const card of generatedCards) {
      await tx.aiStudyCard.create({
        data: {
          projectId: project.id,
          nodeId: card.nodeId,
          overview: card.overview,
          explanation: card.explanation,
          keyPoints: card.keyPoints,
          pitfalls: card.pitfalls,
          examples: card.examples,
          flashcards: card.flashcards,
          modelName: process.env.QWEN_MODEL || null,
          promptVersion,
          aiPromptVersionId: promptConfig.id,
          reviewStatus: "unreviewed"
        }
      });
    }

    await tx.aiStudyGenerationTask.update({
      where: { id: task.id },
      data: {
        status: "succeeded",
        stage: "cards_generated",
        outputSummary: finalOutputSummary,
        finishedAt: new Date(),
        errorMessage: null
      }
    });

    await tx.aiStudyProject.update({
      where: { id: project.id },
      data: { aiPromptVersionId: project.aiPromptVersionId || promptConfig.id, status: "ready" }
    });
  });

  await refreshAiStudyProgressCache(project.id);
}

function parseGeneratedCard(responseText: string, node: AiStudyNode) {
  try {
    return parseJsonWithSchema(responseText, cardSchema, `知识卡片 JSON 格式不合法：${node.title}`);
  } catch {
    const fallbackCard = buildFallbackCard(responseText, node);
    return parseJsonWithSchema(JSON.stringify(fallbackCard), cardSchema, `知识卡片兜底内容不合法：${node.title}`);
  }
}

function buildFallbackCard(responseText: string, node: AiStudyNode) {
  const overview = extractCardStringField(responseText, "overview", ["explanation", "keyPoints", "pitfalls", "examples", "flashcards"])
    || extractCardFallbackText(responseText)
    || node.summary
    || node.title;
  const explanation = extractCardStringField(responseText, "explanation", ["keyPoints", "pitfalls", "examples", "flashcards"])
    || (node.depth >= 3 ? extractCardFallbackText(responseText) || node.summary : "");

  return {
    overview: limitCardText(overview, 1200),
    explanation: limitCardText(explanation, 5000),
    keyPoints: extractCardArrayItems(responseText, "keyPoints", 10),
    pitfalls: [],
    examples: [],
    flashcards: []
  };
}

function extractCardStringField(text: string, field: string, nextFields: string[]) {
  const normalized = stripJsonFence(text);
  const nextPattern = nextFields.map((name) => `"${name}"`).join("|");
  const pattern = new RegExp(`"${field}"\\s*:\\s*"([\\s\\S]*?)(?=",\\s*(?:${nextPattern})\\s*:|",\\s*}\\s*$|}\\s*$)`);
  const value = normalized.match(pattern)?.[1] || "";
  return cleanCardText(value);
}

function extractCardArrayItems(text: string, field: string, maxItems: number) {
  const normalized = stripJsonFence(text);
  const arrayContent = normalized.match(new RegExp(`"${field}"\\s*:\\s*\\[([\\s\\S]*?)\\]`))?.[1] || "";
  if (!arrayContent.trim()) {
    return [];
  }

  return arrayContent
    .split(/",\s*"|'\s*,\s*'|\n|；|;/)
    .map((item) => cleanCardText(item))
    .filter(Boolean)
    .slice(0, maxItems)
    .map((item) => limitCardText(item, 240));
}

function extractCardFallbackText(text: string) {
  return cleanCardText(stripJsonFence(text)
    .replace(/"?(overview|explanation|keyPoints|pitfalls|examples|flashcards)"?\s*:\s*/g, "\n")
    .replace(/[{}\[\]]/g, "\n"));
}

function stripJsonFence(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fenced?.[1]?.trim() || trimmed;
}

function cleanCardText(text: string) {
  return text
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, "\"")
    .replace(/^["'\s,]+|["'\s,]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function limitCardText(text: string, maxLength: number) {
  const cleaned = cleanCardText(text);
  if (cleaned.length <= maxLength) {
    return cleaned;
  }
  return `${cleaned.slice(0, maxLength - 3)}...`;
}

async function updateAiStudyTaskStage(task: AiStudyGenerationTask, stage: string) {
  await prisma.aiStudyGenerationTask.update({
    where: { id: task.id },
    data: { stage }
  });
  await writeAiStudyTaskProgressCache({
    ...task,
    status: "running",
    stage,
    errorMessage: null,
    updatedAt: new Date()
  });
}

type StructuredJsonRequest<T> = {
  task: AiStudyGenerationTask;
  stage: string;
  messages: ChatMessage[];
  retryMessages?: ChatMessage[];
  schema: z.ZodType<T>;
  jsonSchema: QwenJsonSchema;
  relaxedJsonRetry?: boolean;
  maxCompletionTokens: number;
  timeoutMs: number;
  temperature: number;
  invalidMessage: string;
  validate?: (value: T) => void;
  parseResponse?: (responseText: string) => T;
};

type OutlineCheckpoint = {
  promptVersion: string;
  sourceFingerprint: string;
  batchCount: number;
  batches: Array<{
    batchIndex: number;
    candidates: OutlineCandidate[];
  }>;
};

async function requestValidatedJsonWithRetry<T>(request: StructuredJsonRequest<T>): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= structuredJsonMaxAttempts; attempt += 1) {
    const attemptStage = attempt === 1 ? request.stage : `${request.stage}_retry_${attempt - 1}`;
    if (attempt > 1) {
      await prisma.aiStudyGenerationTask.update({
        where: { id: request.task.id },
        data: { retryCount: { increment: 1 } }
      });
    }
    await updateAiStudyTaskStage(request.task, attemptStage);

    const startedAt = Date.now();
    let response: Awaited<ReturnType<typeof askQwenDetailed>> | null = null;
    try {
      const useRelaxedJsonMode = request.relaxedJsonRetry === true && attempt > 1;
      response = await askQwenDetailed(
        attempt > 1 && request.retryMessages ? request.retryMessages : request.messages,
        {
          temperature: request.temperature,
          timeoutMs: request.timeoutMs,
          jsonSchema: useRelaxedJsonMode ? undefined : request.jsonSchema,
          jsonMode: useRelaxedJsonMode,
          maxCompletionTokens: request.maxCompletionTokens,
          enableThinking: false
        }
      );
      if (response.finishReason === "length") {
        throw new Error(`Qwen 输出达到 ${request.maxCompletionTokens} token 上限，内容被截断。`);
      }

      const parsed = request.parseResponse
        ? request.parseResponse(response.content)
        : parseJsonWithSchema(response.content, request.schema, request.invalidMessage);
      request.validate?.(parsed);
      await appendAiStudyTaskDiagnostic(request.task.id, {
        stage: request.stage,
        attempt,
        status: "succeeded",
        durationMs: Date.now() - startedAt,
        finishReason: response.finishReason,
        responseMode: useRelaxedJsonMode ? "json_object" : "json_schema",
        usage: response.usage,
        contentLength: response.content.length
      });
      return parsed;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(request.invalidMessage);
      await appendAiStudyTaskDiagnostic(request.task.id, {
        stage: request.stage,
        attempt,
        status: "failed",
        durationMs: Date.now() - startedAt,
        finishReason: response?.finishReason ?? null,
        responseMode: request.relaxedJsonRetry === true && attempt > 1 ? "json_object" : "json_schema",
        usage: response?.usage ?? null,
        contentLength: response?.content.length ?? 0,
        error: lastError.message.slice(0, 1000),
        contentPreview: response?.content.slice(0, 1200) || null
      });
    }
  }

  throw new Error(`${request.invalidMessage} 已尝试 ${structuredJsonMaxAttempts} 次；最后错误：${lastError?.message || "未知错误"}`);
}

async function appendAiStudyTaskDiagnostic(taskId: string, diagnostic: Record<string, unknown>) {
  const current = await readAiStudyTaskOutputSummary(taskId);
  const existing = Array.isArray(current.diagnostics) ? current.diagnostics : [];
  await prisma.aiStudyGenerationTask.update({
    where: { id: taskId },
    data: {
      outputSummary: toJsonValue({
        ...current,
        diagnostics: [...existing.slice(-39), diagnostic]
      })
    }
  });
}

async function mergeAiStudyTaskOutputSummary(taskId: string, patch: Record<string, unknown>) {
  const current = await readAiStudyTaskOutputSummary(taskId);
  await prisma.aiStudyGenerationTask.update({
    where: { id: taskId },
    data: { outputSummary: toJsonValue({ ...current, ...patch }) }
  });
}

async function buildFinalTaskOutputSummary(taskId: string, patch: Record<string, unknown>) {
  const current = await readAiStudyTaskOutputSummary(taskId);
  return toJsonValue({ ...current, ...patch });
}

async function readAiStudyTaskOutputSummary(taskId: string): Promise<Record<string, unknown>> {
  const record = await prisma.aiStudyGenerationTask.findUnique({
    where: { id: taskId },
    select: { outputSummary: true }
  });
  return asJsonRecord(record?.outputSummary);
}

function asJsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

async function readOutlineCheckpoint(
  taskId: string,
  promptVersion: string,
  sourceFingerprint: string,
  batchCount: number
): Promise<OutlineCheckpoint> {
  const emptyCheckpoint: OutlineCheckpoint = { promptVersion, sourceFingerprint, batchCount, batches: [] };
  const summary = await readAiStudyTaskOutputSummary(taskId);
  const raw = asJsonRecord(summary.outlineCheckpoint);
  if (raw.promptVersion !== promptVersion || raw.sourceFingerprint !== sourceFingerprint || raw.batchCount !== batchCount) {
    return emptyCheckpoint;
  }

  const batches = Array.isArray(raw.batches) ? raw.batches.flatMap((value) => {
    const record = asJsonRecord(value);
    const batchIndex = typeof record.batchIndex === "number" ? record.batchIndex : -1;
    const parsed = outlineCandidateListSchema.safeParse({ candidates: record.candidates });
    return batchIndex >= 0 && batchIndex < batchCount && parsed.success
      ? [{ batchIndex, candidates: parsed.data.candidates }]
      : [];
  }) : [];

  return { ...emptyCheckpoint, batches };
}

function buildOutlineSourceFingerprint(chunks: AiStudySourceChunkWithContent[]) {
  return crypto.createHash("sha256")
    .update(chunks.map((chunk) => `${chunk.id}:${chunk.content.length}`).join("\0"))
    .digest("hex");
}

function validateOutlineCandidates(
  candidates: OutlineCandidate[],
  chunks: AiStudySourceChunkWithContent[],
  maxCandidates: number
) {
  if (candidates.length > maxCandidates) {
    throw new Error(`知识候选数量超过当前批次上限 ${maxCandidates}。`);
  }
  validateOutlineSourceReferences(candidates, chunks);
}

function validateNestedOutline(outline: NestedOutline, chunks: AiStudySourceChunkWithContent[]) {
  const nodes = flattenNestedOutline(outline);
  if (nodes.length > maxNodesPerProject) {
    throw new Error(`知识节点数量超过上限 ${maxNodesPerProject}。`);
  }
  validateOutlineSourceReferences(nodes, chunks);
}

function validateOutlineSourceReferences(
  nodes: Array<{ title: string; sourceChunkIds: string[] }>,
  chunks: AiStudySourceChunkWithContent[]
) {
  const validChunkIds = new Set(chunks.map((chunk) => chunk.id));
  for (const node of nodes) {
    const invalidChunkId = node.sourceChunkIds.find((id) => !validChunkIds.has(id));
    if (invalidChunkId) {
      throw new Error(`知识节点“${node.title}”引用了不存在的来源片段：${invalidChunkId}`);
    }
  }
}

function buildOutlineCandidateTransportInstruction(partialMaxNodes: number) {
  return [
    "【固定输出协议，优先级高于上方可配置提示词中的格式描述】",
    `只输出 JSON 对象：{\"candidates\":[{\"title\":\"...\",\"summary\":\"...\",\"sourceChunkIds\":[\"真实片段ID\"]}]}，候选不超过 ${partialMaxNodes} 个。`,
    "候选只是待归并的原子主题，不要输出 clientId、parentClientId、nodes、层级关系、Markdown 或解释文字。"
  ].join("\n");
}

function buildNestedOutlineTransportInstruction(maxNodes: number) {
  return [
    "【固定输出协议，优先级高于上方可配置提示词中的格式描述】",
    "只输出 JSON 对象，结构必须严格为 root -> modules -> groups -> points 四层。",
    "root、每个 module、每个 group、每个 point 都必须包含 title、summary、sourceChunkIds；root 还包含 modules，module 还包含 groups，group 还包含 points。",
    "modules 必须有 3-6 个；每个 module 必须有 1-4 个 groups；每个 group 必须有 2-4 个 points。",
    `总节点数不得超过 ${maxNodes}；sourceChunkIds 只能使用输入中的真实片段 ID。`,
    "不要输出 clientId、parentClientId、nodes、Markdown 或解释文字。"
  ].join("\n");
}

function buildOutlineMessages(
  projectTitle: string,
  chunks: AiStudySourceChunkWithContent[],
  promptConfig: AiStudyPromptConfig,
  partialMaxNodes = maxNodesPerProject
): ChatMessage[] {
  const sourceChunks = formatChunksForPrompt(chunks);
  return [
    {
      role: "system",
      content: `${promptConfig.render("outline.system", { maxNodesPerProject: partialMaxNodes })}\n\n${buildNestedOutlineTransportInstruction(partialMaxNodes)}`
    },
    {
      role: "user",
      content: promptConfig.render("outline.user", { projectTitle, sourceChunks })
    }
  ];
}

function buildCardMessages(
  projectTitle: string,
  node: AiStudyNode,
  sourceChunks: string,
  promptConfig: AiStudyPromptConfig
): ChatMessage[] {
  const level = node.depth + 1;
  const cardInstruction = getCardInstruction(level, promptConfig);
  return [
    {
      role: "system",
      content: `${promptConfig.render("card.system")}\n\n${buildCardTransportInstruction()}`
    },
    {
      role: "user",
      content: promptConfig.render("card.user", {
        projectTitle,
        level,
        nodeTitle: node.title,
        nodeSummary: node.summary,
        cardInstruction,
        sourceChunks
      })
    }
  ];
}

function buildCardTransportInstruction() {
  return [
    "【固定输出协议，优先级高于上方可配置提示词中的格式描述】",
    "只输出单个 JSON 对象，不要输出 Markdown 代码围栏、思考过程或解释文字。",
    "overview 不超过 800 个中文字符；explanation 不超过 1800 个中文字符；keyPoints 最多 8 条、每条不超过 200 个中文字符。",
    "pitfalls、examples、flashcards 必须输出空数组。避免重复同一句话；字符串中需要引用术语时使用中文引号。"
  ].join("\n");
}

function buildCardRetryMessages(messages: ChatMessage[]): ChatMessage[] {
  const retryInstruction = "【重试要求】上次严格 Schema 输出失败。本次改用精简 JSON：overview 控制在 400 字以内，explanation 控制在 1000 字以内，keyPoints 仅保留 2-4 条；不要重复内容，务必闭合所有字符串、数组和对象。";
  return messages.map((message, index) => index === 0 && message.role === "system"
    ? { ...message, content: `${message.content}\n\n${retryInstruction}` }
    : message);
}

async function generateCompleteOutline(
  task: AiStudyGenerationTask,
  projectTitle: string,
  chunks: AiStudySourceChunkWithContent[],
  promptConfig: AiStudyPromptConfig
) {
  const batches = splitChunksForPrompt(chunks, modelBatchChars);
  if (batches.length === 1) {
    const nestedOutline = await requestValidatedJsonWithRetry({
      task,
      stage: "generating_outline_direct",
      messages: buildOutlineMessages(projectTitle, batches[0], promptConfig),
      schema: nestedOutlineSchema,
      jsonSchema: {
        name: "ai_study_four_level_outline",
        schema: buildNestedOutlineJsonSchema(batches[0].map((chunk) => chunk.id))
      },
      maxCompletionTokens: outlineMergeMaxTokens,
      timeoutMs: outlineTimeoutMs,
      temperature: 0.15,
      invalidMessage: "知识框架 JSON 格式不合法。",
      validate: (value) => validateNestedOutline(value, chunks)
    });
    return { nodes: flattenNestedOutline(nestedOutline) };
  }

  const partialMaxNodes = Math.max(8, Math.ceil((maxNodesPerProject - 1) / batches.length) + 3);
  const sourceFingerprint = buildOutlineSourceFingerprint(chunks);
  const checkpoint = await readOutlineCheckpoint(task.id, promptConfig.version, sourceFingerprint, batches.length);
  const partialCandidates: OutlineCandidate[] = [];
  const completedBatches = new Map(checkpoint.batches.map((batch) => [batch.batchIndex, batch.candidates]));

  for (const [batchIndex, batch] of batches.entries()) {
    const existingCandidates = completedBatches.get(batchIndex);
    if (existingCandidates) {
      await updateAiStudyTaskStage(task, `resuming_outline_partial_${batchIndex + 1}_of_${batches.length}`);
      partialCandidates.push(...existingCandidates);
      continue;
    }

    const partial = await requestValidatedJsonWithRetry({
      task,
      stage: `generating_outline_partial_${batchIndex + 1}_of_${batches.length}`,
      messages: [
        {
          role: "system",
          content: `${promptConfig.render("outline.partial.system", { partialMaxNodes })}\n\n${buildOutlineCandidateTransportInstruction(partialMaxNodes)}`
        },
        {
          role: "user",
          content: promptConfig.render("outline.partial.user", {
            projectTitle,
            batchNumber: batchIndex + 1,
            batchCount: batches.length,
            sourceChunks: formatChunksForPrompt(batch)
          })
        }
      ],
      schema: outlineCandidateListSchema,
      jsonSchema: {
        name: "ai_study_outline_candidates",
        schema: buildOutlineCandidateJsonSchema(partialMaxNodes, batch.map((chunk) => chunk.id))
      },
      maxCompletionTokens: outlinePartialMaxTokens,
      timeoutMs: outlineTimeoutMs,
      temperature: 0.15,
      invalidMessage: `第 ${batchIndex + 1} 批知识候选 JSON 格式不合法。`,
      validate: (value) => validateOutlineCandidates(value.candidates, batch, partialMaxNodes)
    });
    partialCandidates.push(...partial.candidates);
    checkpoint.batches.push({ batchIndex, candidates: partial.candidates });
    await mergeAiStudyTaskOutputSummary(task.id, { outlineCheckpoint: checkpoint });
  }

  const nestedOutline = await requestValidatedJsonWithRetry({
    task,
    stage: "merging_outline",
    messages: [
      {
        role: "system",
        content: `${promptConfig.render("outline.merge.system", { maxNodesPerProject })}\n\n${buildNestedOutlineTransportInstruction(maxNodesPerProject)}`
      },
      {
        role: "user",
        content: promptConfig.render("outline.merge.user", {
          projectTitle,
          candidateNodes: JSON.stringify({ candidates: partialCandidates })
        })
      }
    ],
    schema: nestedOutlineSchema,
    jsonSchema: {
      name: "ai_study_four_level_outline",
      schema: buildNestedOutlineJsonSchema(chunks.map((chunk) => chunk.id))
    },
    maxCompletionTokens: outlineMergeMaxTokens,
    timeoutMs: outlineTimeoutMs,
    temperature: 0.1,
    invalidMessage: "合并后的知识框架 JSON 格式不合法。",
    validate: (value) => validateNestedOutline(value, chunks)
  });
  return { nodes: flattenNestedOutline(nestedOutline) };
}

async function buildCompleteCardEvidence(
  projectTitle: string,
  node: AiStudyNode,
  chunks: AiStudySourceChunkWithContent[],
  promptConfig: AiStudyPromptConfig
) {
  const batches = splitChunksForPrompt(chunks, modelBatchChars);
  if (batches.length === 1) {
    return formatChunksForPrompt(batches[0]);
  }

  let summaries: string[] = [];
  for (const [batchIndex, batch] of batches.entries()) {
    summaries.push(await askQwen([
      { role: "system", content: promptConfig.render("card.evidence.system") },
      {
        role: "user",
        content: promptConfig.render("card.evidence.user", {
          projectTitle,
          nodeTitle: node.title,
          batchNumber: batchIndex + 1,
          batchCount: batches.length,
          sourceChunks: formatChunksForPrompt(batch)
        })
      }
    ], {
      temperature: 0.1,
      timeoutMs: cardTimeoutMs,
      maxCompletionTokens: 4_096,
      enableThinking: false
    }));
  }

  while (summaries.join(promptItemSeparator).length > modelBatchChars) {
    const groups = splitStringsByChars(summaries, modelBatchChars);
    const reduced: string[] = [];
    for (const group of groups) {
      reduced.push(await askQwen([
        { role: "system", content: promptConfig.render("card.evidence.system") },
        {
          role: "user",
          content: promptConfig.render("card.evidence.user", {
            projectTitle,
            nodeTitle: node.title,
            batchNumber: 1,
            batchCount: groups.length,
            sourceChunks: group.join(promptItemSeparator)
          })
        }
      ], {
        temperature: 0.1,
        timeoutMs: cardTimeoutMs,
        maxCompletionTokens: 4_096,
        enableThinking: false
      }));
    }
    if (reduced.join("").length >= summaries.join("").length) {
      throw new Error(`节点证据归并后未能收敛：${node.title}`);
    }
    summaries = reduced;
  }

  return summaries.join(promptItemSeparator);
}

function getCardInstruction(level: number, promptConfig: AiStudyPromptConfig) {
  if (level === 1) {
    return promptConfig.render("card.instruction.level1");
  }

  if (level === 2 || level === 3) {
    return promptConfig.render("card.instruction.level2_3");
  }

  return promptConfig.render("card.instruction.level4");
}

function prepareOutlineNodes(nodes: z.infer<typeof outlineNodeSchema>[], chunks: AiStudySourceChunkWithContent[], projectTitle: string): OutlineNode[] {
  const normalizedNodes = ensureOutlineMaxDepth(ensureSingleRootNode(nodes, chunks, projectTitle));

  if (normalizedNodes.length > maxNodesPerProject) {
    throw new Error(`知识节点数量超过上限 ${maxNodesPerProject}。`);
  }

  const validChunkIds = new Set(chunks.map((chunk) => chunk.id));
  const clientIds = new Set<string>();
  for (const node of normalizedNodes) {
    if (clientIds.has(node.clientId)) {
      throw new Error(`知识框架 clientId 重复：${node.clientId}`);
    }
    clientIds.add(node.clientId);
  }

  const depthCache = new Map<string, number>();
  function resolveDepth(node: z.infer<typeof outlineNodeSchema>, seen = new Set<string>()): number {
    if (!node.parentClientId) {
      return 0;
    }
    if (seen.has(node.clientId)) {
      throw new Error("知识框架存在循环父子关系。");
    }
    const parent = normalizedNodes.find((candidate) => candidate.clientId === node.parentClientId);
    if (!parent) {
      throw new Error(`知识框架父节点不存在：${node.parentClientId}`);
    }
    const cached = depthCache.get(parent.clientId);
    const parentDepth = cached ?? resolveDepth(parent, new Set([...seen, node.clientId]));
    const depth = parentDepth + 1;
    if (depth > 3) {
      throw new Error("知识框架最多支持 4 层。");
    }
    depthCache.set(node.clientId, depth);
    return depth;
  }

  const preparedNodes = normalizedNodes
    .map((node, sortOrder) => {
      const sourceChunkIds = node.parentClientId
        ? resolveOutlineSourceChunkIds(node, validChunkIds)
        : chunks.map((chunk) => chunk.id);
      return {
        ...node,
        parentClientId: node.parentClientId || null,
        sourceChunkIds,
        depth: resolveDepth(node),
        sortOrder
      };
    });

  assertCompleteFourLevelOutline(preparedNodes);
  return ensureNonRootChunkCoverage(preparedNodes, chunks)
    .sort((left, right) => left.depth - right.depth || left.sortOrder - right.sortOrder);
}

function ensureNonRootChunkCoverage(nodes: OutlineNode[], chunks: AiStudySourceChunkWithContent[]) {
  const nonRootNodes = nodes.filter((node) => node.depth > 0);
  if (nonRootNodes.length === 0) {
    throw new Error("知识框架至少需要一个非根学习节点。");
  }

  const chunksById = new Map(chunks.map((chunk) => [chunk.id, chunk]));
  const coveredChunkIds = new Set(nonRootNodes.flatMap((node) => node.sourceChunkIds));
  for (const chunk of chunks) {
    if (coveredChunkIds.has(chunk.id)) {
      continue;
    }

    const target = [...nonRootNodes].sort((left, right) => {
      const distanceDifference = readOutlineChunkDistance(left, chunk, chunksById)
        - readOutlineChunkDistance(right, chunk, chunksById);
      return distanceDifference || right.depth - left.depth || left.sortOrder - right.sortOrder;
    })[0];
    target.sourceChunkIds = [...target.sourceChunkIds, chunk.id];
    coveredChunkIds.add(chunk.id);
  }

  return nodes;
}

function readOutlineChunkDistance(
  node: OutlineNode,
  chunk: AiStudySourceChunkWithContent,
  chunksById: Map<string, AiStudySourceChunkWithContent>
) {
  const sourceChunks = node.sourceChunkIds
    .map((id) => chunksById.get(id))
    .filter((value): value is AiStudySourceChunkWithContent => Boolean(value));
  if (sourceChunks.length === 0) {
    return Number.MAX_SAFE_INTEGER;
  }
  return Math.min(...sourceChunks.map((sourceChunk) => Math.abs(sourceChunk.chunkIndex - chunk.chunkIndex)));
}

function ensureOutlineMaxDepth(nodes: z.infer<typeof outlineNodeSchema>[]) {
  const depthByClientId = resolveOutlineDepths(nodes);
  const nodeByClientId = new Map(nodes.map((node) => [node.clientId, node]));

  return nodes.map((node) => {
    const depth = depthByClientId.get(node.clientId) ?? 0;
    if (depth <= 3) {
      return node;
    }

    return {
      ...node,
      parentClientId: findOutlineAncestorAtDepth(node, 2, nodeByClientId, depthByClientId)
    };
  });
}

function resolveOutlineDepths(nodes: z.infer<typeof outlineNodeSchema>[]) {
  const nodeByClientId = new Map(nodes.map((node) => [node.clientId, node]));
  const depthByClientId = new Map<string, number>();

  function resolve(node: z.infer<typeof outlineNodeSchema>, seen = new Set<string>()): number {
    if (!node.parentClientId) {
      return 0;
    }
    if (seen.has(node.clientId)) {
      throw new Error("知识框架存在循环父子关系。");
    }
    const parent = nodeByClientId.get(node.parentClientId);
    if (!parent) {
      throw new Error(`知识框架父节点不存在：${node.parentClientId}`);
    }

    const cached = depthByClientId.get(parent.clientId);
    const parentDepth = cached ?? resolve(parent, new Set([...seen, node.clientId]));
    const depth = parentDepth + 1;
    depthByClientId.set(node.clientId, depth);
    return depth;
  }

  for (const node of nodes) {
    depthByClientId.set(node.clientId, resolve(node));
  }

  return depthByClientId;
}

function findOutlineAncestorAtDepth(
  node: z.infer<typeof outlineNodeSchema>,
  targetDepth: number,
  nodeByClientId: Map<string, z.infer<typeof outlineNodeSchema>>,
  depthByClientId: Map<string, number>
) {
  let current = node.parentClientId ? nodeByClientId.get(node.parentClientId) : null;
  while (current) {
    const depth = depthByClientId.get(current.clientId) ?? 0;
    if (depth <= targetDepth) {
      return current.clientId;
    }
    current = current.parentClientId ? nodeByClientId.get(current.parentClientId) : null;
  }
  return node.parentClientId || null;
}

function resolveOutlineSourceChunkIds(
  node: z.infer<typeof outlineNodeSchema>,
  validChunkIds: Set<string>
) {
  const directChunkIds = normalizeOutlineSourceChunkIds(node.sourceChunkIds, validChunkIds);
  if (directChunkIds.length > 0) {
    return directChunkIds;
  }
  throw new Error(`知识节点引用了不存在的来源片段：${node.title}`);
}

function normalizeOutlineSourceChunkIds(sourceChunkIds: string[], validChunkIds: Set<string>) {
  return Array.from(new Set(sourceChunkIds.filter((id) => validChunkIds.has(id))));
}

function ensureSingleRootNode(nodes: z.infer<typeof outlineNodeSchema>[], chunks: AiStudySourceChunkWithContent[], projectTitle: string) {
  const roots = nodes.filter((node) => !node.parentClientId);
  if (roots.length === 1) {
    return nodes.map((node) => node.clientId === roots[0].clientId
      ? { ...node, sourceChunkIds: chunks.map((chunk) => chunk.id) }
      : node);
  }

  const rootClientId = "__project_root";
  const rootSummary = roots.length > 0
    ? roots.map((node) => node.summary).join("；").slice(0, 600)
    : "整份学习资料的核心内容总览。";
  const rootChunkIds = chunks.map((chunk) => chunk.id);

  return [
    {
      clientId: rootClientId,
      parentClientId: null,
      title: projectTitle.slice(0, 80) || "学习资料知识图谱",
      summary: rootSummary || "整份学习资料的核心内容总览。",
      sourceChunkIds: rootChunkIds
    },
    ...nodes.map((node) => ({
      ...node,
      parentClientId: roots.length === 0 ? rootClientId : node.parentClientId || rootClientId
    }))
  ];
}

function getNodeSourceChunks(node: AiStudyNode, chunksById: Map<string, AiStudySourceChunkWithContent>) {
  const chunkIds = Array.isArray(node.sourceChunkIds) ? node.sourceChunkIds.filter((value): value is string => typeof value === "string") : [];
  const chunks = chunkIds.map((id) => chunksById.get(id)).filter((chunk): chunk is AiStudySourceChunkWithContent => Boolean(chunk));
  if (chunks.length === 0) {
    throw new Error(`知识节点缺少来源片段：${node.title}`);
  }
  return chunks;
}

function parseJsonWithSchema<T>(text: string, schema: z.ZodType<T>, message: string): T {
  const parsedJson = JSON.parse(extractJsonObject(text));
  const parsed = schema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new Error(`${message} ${parsed.error.issues.map((issue) => issue.path.join(".") || issue.message).join("; ")}`);
  }
  return parsed.data;
}

function extractJsonObject(text: string) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    const candidate = fenced[1].trim();
    if (candidate.startsWith("{") && candidate.endsWith("}")) {
      return candidate;
    }
  }

  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) {
    return trimmed.slice(first, last + 1);
  }

  throw new Error("AI 返回内容中没有找到 JSON 对象。");
}

function formatChunksForPrompt(chunks: AiStudySourceChunkWithContent[]) {
  return chunks.map((chunk) => {
    const pageRange = chunk.pageStart && chunk.pageEnd
      ? `; pages=${chunk.pageStart}-${chunk.pageEnd}`
      : chunk.pageNumber ? `; page=${chunk.pageNumber}` : "";
    const chunkType = chunk.chunkType ? `; type=${chunk.chunkType}` : "";
    return `[sourceChunkId=${chunk.id}; chunkIndex=${chunk.chunkIndex}${pageRange}${chunkType}]\n${chunk.content}`;
  }).join(promptItemSeparator);
}

function splitChunksForPrompt(chunks: AiStudySourceChunkWithContent[], maxChars: number) {
  const batches: AiStudySourceChunkWithContent[][] = [];
  let current: AiStudySourceChunkWithContent[] = [];
  let currentLength = 0;
  for (const chunk of chunks) {
    const chunkLength = formatChunksForPrompt([chunk]).length;
    const separatorLength = current.length > 0 ? promptItemSeparator.length : 0;
    if (chunkLength > maxChars) {
      throw new Error(`来源片段超过单批模型输入上限：${chunk.id}`);
    }
    if (current.length > 0 && currentLength + separatorLength + chunkLength > maxChars) {
      batches.push(current);
      current = [];
      currentLength = 0;
    }
    const nextSeparatorLength = current.length > 0 ? promptItemSeparator.length : 0;
    current.push(chunk);
    currentLength += nextSeparatorLength + chunkLength;
  }
  if (current.length > 0) {
    batches.push(current);
  }
  return batches;
}

function splitStringsByChars(values: string[], maxChars: number) {
  const groups: string[][] = [];
  let current: string[] = [];
  let currentLength = 0;
  for (const value of values) {
    const separatorLength = current.length > 0 ? promptItemSeparator.length : 0;
    if (value.length > maxChars) {
      throw new Error("证据摘要超过单批模型输入上限。");
    }
    if (current.length > 0 && currentLength + separatorLength + value.length > maxChars) {
      groups.push(current);
      current = [];
      currentLength = 0;
    }
    const nextSeparatorLength = current.length > 0 ? promptItemSeparator.length : 0;
    current.push(value);
    currentLength += nextSeparatorLength + value.length;
  }
  if (current.length > 0) {
    groups.push(current);
  }
  return groups;
}

function normalizeParsedText(text: string) {
  return text.replace(/\r\n/g, "\n")
    .split(/(```[\s\S]*?```)/g)
    .map((part) => part.startsWith("```")
      ? part.trim()
      : part
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{4,}/g, "\n\n")
        .replace(/[ \t]{2,}/g, " ")
        .trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}
