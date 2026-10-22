import { z } from "zod";
import crypto from "crypto";
import type { AiStudyGenerationTask, AiStudyProject, AiStudySource, Prisma } from "@prisma/client";
import { markAiStudyTaskFailed } from "@/lib/ai-study";
import { enqueueAiStudyTask } from "@/lib/ai-study-task-queue";
import { askQwenDetailed, type ChatMessage, type QwenJsonSchema } from "@/lib/qwen";
import type { ActiveAiServerConfig } from "@/lib/ai-server-settings";
import { prisma } from "@/lib/prisma";
import { downloadAiStudyObject, uploadAiStudyObject } from "@/lib/ai-study-storage";
import { refreshAiStudyProgressCache, writeAiStudyTaskProgressCache } from "@/lib/ai-study-progress-cache";
import { assertCompleteFourLevelOutline } from "@/lib/ai-study-outline-validation";
import { chapterProtocol as curriculumProtocol, generateChapterCurriculum, type ChapterCheckpoint } from "@/lib/ai-study-chapter-curriculum";
import { readCardManifest, refreshCardProject } from "@/lib/ai-study-card-jobs";
import { buildDirectoryCard, AiStudyContentValidationError } from "@/lib/ai-study-grounded-card";
import { parsePdfWithMineru, type MineruContentBlock, type MineruParseResult } from "@/lib/ai-study-mineru";
import { inspectAndSplitPdf } from "@/lib/ai-study-pdf-parts";
import {
  formatAiStudySourceBlockContent,
  loadAiStudySourceChunksWithContent
} from "@/lib/ai-study-source-content";

const outlineTimeoutMs = Number(process.env.AI_STUDY_OUTLINE_TIMEOUT_MS || 200_000);
const curriculumSafetyMaxNodes = Number(process.env.AI_STUDY_CURRICULUM_MAX_NODES || 5000);
const maxSourceChunks = Number(process.env.AI_STUDY_MAX_SOURCE_CHUNKS || 5_000);
const structuredJsonMaxAttempts = Math.max(1, Number(process.env.AI_STUDY_JSON_MAX_ATTEMPTS || 2));
type StructuredJsonFailure = { error: Error; responseContent: string | null };

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

export async function processClaimedAiStudyTask(taskId: string, serverConfig?: ActiveAiServerConfig) {
  const task = await prisma.aiStudyGenerationTask.findUnique({ where: { id: taskId } });
  if (!task || task.status !== "running") return false;

  try {
    await writeAiStudyTaskProgressCache(task);
    await processAiStudyTask(task.id, serverConfig);
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

async function processAiStudyTask(taskId: string, serverConfig?: ActiveAiServerConfig) {
  const task = await prisma.aiStudyGenerationTask.findUnique({
    where: { id: taskId }
  });
  if (!task) {
    return;
  }

  if (task.type === "generate_outline") {
    await generateOutline(task, serverConfig);
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
  const body = source.project.partIndex === null
    ? await splitLargePdfIntoProjects(task, source, object.body)
    : object.body;

  await updateAiStudyTaskStage(task, "submitting_to_mineru");

  const parsed = await parseAndPersistMineruArtifacts({
    body,
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

async function splitLargePdfIntoProjects(
  task: AiStudyGenerationTask,
  source: AiStudySource & { project: AiStudyProject },
  body: Buffer
): Promise<Buffer> {
  await updateAiStudyTaskStage(task, "inspecting_pdf_parts");
  const split = await inspectAndSplitPdf(body);
  if (split.ranges.length === 1) return body;

  const originalStorageKey = source.storageKey!;
  const saved: Array<{ bucket: string; key: string; storagePath: string; size: number }> = [];
  for (const range of split.ranges) {
    const part = split.parts[range.index - 1];
    const key = `ai-study/${source.project.ownerId}/${source.projectId}/${source.id}/parts/part-${range.index}.pdf`;
    const uploaded = await uploadAiStudyObject({ key, body: part, contentType: "application/pdf" });
    saved.push({ ...uploaded, size: part.length });
  }

  const queued: AiStudyGenerationTask[] = [];
  await prisma.$transaction(async (tx) => {
    const claim = await tx.aiStudyProject.updateMany({
      where: { id: source.projectId, partIndex: null, deletedAt: null },
      data: {
        title: partTitle(source.project.title, 1, split.ranges.length),
        partGroupId: source.projectId,
        partIndex: 1,
        partCount: split.ranges.length
      }
    });
    if (claim.count !== 1) throw new Error("PDF 分部状态已变化，请重试任务。");
    await tx.aiStudySource.update({
      where: { id: source.id },
      data: {
        storageBucket: saved[0].bucket,
        storageKey: saved[0].key,
        storagePath: saved[0].storagePath,
        fileSizeBytes: saved[0].size,
        fileName: partFileName(source.fileName, 1, split.ranges[0].startPage, split.ranges[0].endPage),
        originalStorageKey,
        originalPageStart: split.ranges[0].startPage,
        originalPageEnd: split.ranges[0].endPage
      }
    });
    for (const range of split.ranges.slice(1)) {
      const part = saved[range.index - 1];
      const project = await tx.aiStudyProject.create({
        data: {
          ownerId: source.project.ownerId,
          title: partTitle(source.project.title, range.index, split.ranges.length),
          description: source.project.description,
          sourceType: source.project.sourceType,
          learningGoal: source.project.learningGoal,
          courseId: source.project.courseId,
          status: "processing",
          partGroupId: source.projectId,
          partIndex: range.index,
          partCount: split.ranges.length,
          canonicalProjectId: source.projectId
        }
      });
      const childSource = await tx.aiStudySource.create({
        data: {
          projectId: project.id,
          sourceType: source.sourceType,
          fileName: partFileName(source.fileName, range.index, range.startPage, range.endPage),
          mimeType: "application/pdf",
          fileSizeBytes: part.size,
          storageBucket: part.bucket,
          storageKey: part.key,
          storagePath: part.storagePath,
          originalStorageKey,
          originalPageStart: range.startPage,
          originalPageEnd: range.endPage,
          status: "uploaded"
        }
      });
      queued.push(await tx.aiStudyGenerationTask.create({
        data: {
          projectId: project.id,
          sourceId: childSource.id,
          type: "parse_source",
          stage: "waiting_for_source_parse",
          inputSummary: { sourceType: "pdf", partIndex: range.index, partCount: split.ranges.length, originalPageStart: range.startPage, originalPageEnd: range.endPage }
        }
      }));
    }
  }, { timeout: 30000 });
  await Promise.all(queued.map((nextTask) => enqueueAiStudyTask(nextTask)));
  await refreshAiStudyProgressCache(source.projectId);
  return split.parts[0];
}

function partTitle(title: string, index: number, count: number) {
  const prefix = `[Part.${index}/${count}] `;
  return `${prefix}${title.slice(0, Math.max(1, 80 - prefix.length))}`;
}

function partFileName(fileName: string | null, index: number, startPage: number, endPage: number) {
  const base = (fileName || "learning-material.pdf").replace(/\.pdf$/i, "").slice(0, 120);
  return `${base}-Part${index}-original-p${startPage}-${endPage}.pdf`;
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
      blockType: headingLevel !== null ? "heading" : blockType,
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
  if (!["header", "title"].includes(String(block.type || "")) && !(block.type === "text" && typeof block.text_level === "number" && block.text_level > 0)) {
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

async function generateOutline(task: AiStudyGenerationTask, serverConfig?: ActiveAiServerConfig) {
  if (!serverConfig) {
    throw new Error("知识点提取任务未绑定 AI 服务器。");
  }
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

  const saved = asJsonRecord((await readAiStudyTaskOutputSummary(task.id)).curriculumCheckpoint);
  const curriculum = await generateChapterCurriculum({
    projectTitle: project.title, sources: sourceChunks, safetyMaxNodes: curriculumSafetyMaxNodes,
    checkpoint: typeof saved.fingerprint === "string"
      ? saved as ChapterCheckpoint : undefined,
    saveCheckpoint: async (checkpoint) => { await mergeAiStudyTaskOutputSummary(task.id, { curriculumCheckpoint: checkpoint }); },
    request: (request) => {
      const call = request;
      return requestValidatedJsonWithRetry({
      task, stage: call.stage, messages: call.messages, inputIds: call.inputIds,
      retryMessages: (failure) => [...call.messages, { role: "user", content: `本步骤未通过校验：${failure.error.message}。请修正后重新输出完整JSON；不得删减证据或主题。` }],
      schema: z.string(), parseResponse: (content) => content, validate: call.validateContent,
      jsonSchema: call.jsonSchema, maxCompletionTokens: call.maxCompletionTokens,
      timeoutMs: outlineTimeoutMs, temperature: 0.2, enableThinking: false,
      serverConfig,
      invalidMessage: "证据与知识目录生成未通过校验。"
      });
    }
  });
  const preparedNodes = curriculum.nodes.slice().sort((a, b) => a.depth - b.depth || a.sortOrder - b.sortOrder);
  assertCompleteFourLevelOutline(preparedNodes);
  const nodeIdByClientId = new Map(preparedNodes.map((node) => [node.clientId, crypto.randomUUID()]));
  const curriculumManifestKey = `ai-study/${project.id}/generation/${task.id}/${curriculumProtocol}.json`;
  await uploadAiStudyObject({ key: curriculumManifestKey, body: Buffer.from(JSON.stringify({ ...curriculum, nodeIds: Object.fromEntries(nodeIdByClientId) }), "utf8"), contentType: "application/json" });
  const finalOutputSummary = await buildFinalTaskOutputSummary(task.id, {
    nodeCount: preparedNodes.length,
    outlineCheckpoint: null,
    curriculumCheckpoint: null,
    generationProtocol: curriculumProtocol,
    curriculumManifestKey,
    curriculumFingerprint: curriculum.fingerprint,
    evidenceUnitCount: curriculum.units.length,
    objectiveCount: curriculum.topics.reduce((sum, topic) => sum + topic.objectives.length, 0),
    excludedEvidenceCount: Object.values(curriculum.decisions).filter((decision) => decision.exclusion).length,
    supportingEvidenceCount: Object.values(curriculum.decisions).filter((decision) => decision.exclusion === "supporting_material").length
  });

  let nextTask: AiStudyGenerationTask | null = null;
  await prisma.$transaction(async (tx) => {
    await tx.aiStudyProgress.deleteMany({ where: { projectId: project.id } });
    await tx.aiStudyCard.deleteMany({ where: { projectId: project.id } });
    await tx.aiStudyNode.deleteMany({ where: { projectId: project.id } });

    await tx.aiStudyNode.createMany({ data: preparedNodes.map((node) => {
      const parentId = node.parentClientId ? nodeIdByClientId.get(node.parentClientId) : null;
      if (node.parentClientId && !parentId) throw new Error(`知识框架父节点缺失：${node.title}`);
      return { id: nodeIdByClientId.get(node.clientId)!, projectId: project.id, parentId,
        title: node.title, summary: node.summary, sortOrder: node.sortOrder, depth: node.depth,
        sourceChunkIds: node.sourceChunkIds, status: "ready" as const };
    }) });
    await tx.aiStudyProgress.createMany({ data: preparedNodes.map((node) => ({
      userId: project.ownerId, projectId: project.id,
      nodeId: nodeIdByClientId.get(node.clientId)!, status: "not_started" as const
    })) });

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
          outlineTaskId: task.id,
          generationProtocol: curriculumProtocol
        }
      }
    });

    await tx.aiStudyProject.update({
      where: { id: project.id },
      data: {
        status: "processing",
        learningReadyAt: new Date(),
        knowledgeCount: preparedNodes.length,
        masteredCount: 0
      }
    });
  }, { timeout: 20000 });

  await refreshAiStudyProgressCache(project.id);
  await enqueueAiStudyTask(nextTask);
}

async function generateCards(task: AiStudyGenerationTask) {
  await updateAiStudyTaskStage(task,"scheduling_cards");
  const project = await prisma.aiStudyProject.findUniqueOrThrow({where:{id:task.projectId},include:{nodes:{include:{cards:{select:{id:true}}}}}});
  if(project.deletedAt)throw new Error("学习项目已删除。");
  const outlineTaskId=asJsonRecord(task.inputSummary).outlineTaskId;
  if(typeof outlineTaskId!=="string")throw new Error("任务缺少框架来源。");
  const outline=await prisma.aiStudyGenerationTask.findFirstOrThrow({where:{id:outlineTaskId,projectId:project.id,type:"generate_outline",status:"succeeded"}});
  const key=asJsonRecord(outline.outputSummary).curriculumManifestKey;
  if(typeof key!=="string"||!key.startsWith(`ai-study/${project.id}/generation/${outline.id}/`))throw new Error("清单路径不属于此项目。");
  const manifest=await readCardManifest(key);
  if(project.nodes.length!==manifest.nodes.length || project.nodes.some(n=>!Object.values(manifest.nodeIds!).includes(n.id)))throw new Error("当前目录和来源清单不一致。");
  await prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM ai_study_projects WHERE id=${project.id} FOR UPDATE`;
    for(const n of manifest.nodes.filter(n=>n.depth<3)){
      const id=manifest.nodeIds![n.clientId];
      if(!await tx.aiStudyCard.findFirst({where:{nodeId:id},select:{id:true}}))await tx.aiStudyCard.create({data:{...buildDirectoryCard(n,manifest.nodes.filter(c=>c.parentClientId===n.clientId)),projectId:project.id,nodeId:id,modelName:"deterministic-directory",promptVersion:manifest.protocol}});
    }
    await tx.aiStudyOverviewJob.createMany({skipDuplicates:true,data:manifest.nodes.filter(n=>n.depth===1||n.depth===2).map(n=>({nodeId:manifest.nodeIds![n.clientId],projectId:project.id}))});
    await tx.aiStudyCardJob.createMany({skipDuplicates:true,data:manifest.nodes.filter(n=>n.depth===3).map(n=>({nodeId:manifest.nodeIds![n.clientId],projectId:project.id,outlineTaskId:outline.id,manifestKey:key,protocol:manifest.protocol,status:project.nodes.find(node=>node.id===manifest.nodeIds![n.clientId])?.cards.length?"succeeded":"unrequested",priority:0}))});
    await tx.aiStudyProject.update({where:{id:project.id},data:{learningReadyAt:project.learningReadyAt??new Date()}});
    await tx.aiStudyGenerationTask.update({where:{id:task.id},data:{status:"succeeded",stage:"cards_scheduled",finishedAt:new Date(),outputSummary:{generationProtocol:manifest.protocol,scheduledCardCount:manifest.topics.length}}});
  },{timeout:20000});
  await refreshCardProject(project.id);
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
  inputIds?: string[];
  messages: ChatMessage[];
  retryMessages?: ChatMessage[] | ((failure: StructuredJsonFailure) => ChatMessage[]);
  schema: z.ZodType<T>;
  jsonSchema: QwenJsonSchema;
  relaxedJsonRetry?: boolean;
  maxCompletionTokens: number;
  timeoutMs: number;
  temperature: number;
  presencePenalty?: number;
  topP?: number;
  enableThinking?: boolean;
  serverConfig?: ActiveAiServerConfig;
  maxAttempts?: number;
  invalidMessage: string;
  validate?: (value: T) => void;
  parseResponse?: (responseText: string) => T;
  onValidatedResponse?: (response: Awaited<ReturnType<typeof askQwenDetailed>>) => void;
};

async function requestValidatedJsonWithRetry<T>(request: StructuredJsonRequest<T>): Promise<T> {
  let lastError: Error | null = null;
  let previousFailure: StructuredJsonFailure | null = null;

  const maxAttempts = request.maxAttempts ?? structuredJsonMaxAttempts;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
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
    let contentValidated = false;
    try {
      const useRelaxedJsonMode = request.relaxedJsonRetry === true && attempt > 1;
      const retryMessages = attempt > 1 && previousFailure && request.retryMessages
        ? typeof request.retryMessages === "function"
          ? request.retryMessages(previousFailure)
          : request.retryMessages
        : request.messages;
      response = await askQwenDetailed(
        retryMessages,
        {
          moduleKey: "ai_study_generation",
          serverConfig: request.serverConfig,
          temperature: request.temperature,
          presencePenalty: request.presencePenalty,
          topP: request.topP,
          timeoutMs: request.timeoutMs,
          jsonSchema: useRelaxedJsonMode ? undefined : request.jsonSchema,
          jsonMode: useRelaxedJsonMode,
          maxCompletionTokens: request.maxCompletionTokens,
          enableThinking: request.enableThinking ?? false
        }
      );
      if (response.finishReason === "length") {
        throw new Error(`模型输出达到 ${request.maxCompletionTokens} token 上限，内容被截断。`);
      }

      const parseResponse = request.parseResponse;
      const parsed = parseResponse
        ? parseResponse(response.content)
        : parseJsonWithSchema(response.content, request.schema, request.invalidMessage);
      request.validate?.(parsed);
      request.onValidatedResponse?.(response);
      contentValidated = true;
      await appendAiStudyTaskDiagnostic(request.task.id, {
        stage: request.stage,
        inputIds: request.inputIds,
        attempt,
        status: "succeeded",
        durationMs: Date.now() - startedAt,
        finishReason: response.finishReason,
        responseMode: useRelaxedJsonMode ? "json_object" : "json_schema",
        usage: response.usage,
        model: response.serverConfig.model,
        contentLength: response.content.length
      });
      return parsed;
    } catch (error) {
      if (contentValidated) throw error; // Persistence failure is not bad model content.
      lastError = error instanceof Error ? error : new Error(request.invalidMessage);
      if (!response) {
        const cause = asJsonRecord(asJsonRecord(error).cause);
        const code = typeof cause.code === "string" ? ` (${cause.code})` : "";
        lastError = new Error(`模型请求失败：${lastError.message}${code}`);
      }
      previousFailure = { error: lastError, responseContent: response?.content ?? null };
      await appendAiStudyTaskDiagnostic(request.task.id, {
        stage: request.stage,
        inputIds: request.inputIds,
        attempt,
        status: "failed",
        failureType: response ? "validation" : "transport",
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

  const reason = lastError?.message || "未知错误";
  if (reason.startsWith("模型请求失败")) throw new Error(`模型连接或响应异常。 已尝试 ${maxAttempts} 次；最后错误：${reason}`);
  throw new AiStudyContentValidationError(`${request.invalidMessage} 已尝试 ${maxAttempts} 次；最后错误：${reason}`);
}

async function appendAiStudyTaskDiagnostic(taskId: string, diagnostic: Record<string, unknown>) {
  const current = await readAiStudyTaskOutputSummary(taskId);
  const existing = Array.isArray(current.diagnostics) ? current.diagnostics : [];
  const totals = asJsonRecord(current.diagnosticTotals);
  const failures = Array.isArray(current.failureDiagnostics) ? current.failureDiagnostics : [];
  await prisma.aiStudyGenerationTask.update({
    where: { id: taskId },
    data: {
      outputSummary: toJsonValue({
        ...current,
        diagnostics: [...existing.slice(-39), diagnostic],
        failureDiagnostics: diagnostic.status === "failed" ? [...failures.slice(-39), diagnostic] : failures,
        diagnosticTotals: {
          calls: Number(totals.calls || 0) + 1,
          failedCalls: Number(totals.failedCalls || 0) + (diagnostic.status === "failed" ? 1 : 0),
          durationMs: Number(totals.durationMs || 0) + Number(diagnostic.durationMs || 0)
        }
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
