import { z } from "zod";
import type { AiStudyGenerationTask, AiStudyNode, AiStudySourceChunk } from "@prisma/client";
import pdfParse from "pdf-parse";
import WordExtractor from "word-extractor";
import { buildAiStudyTextChunks, markAiStudyTaskFailed, markAiStudyTaskSucceeded } from "@/lib/ai-study";
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
import { askQwen, type ChatMessage } from "@/lib/qwen";
import { prisma } from "@/lib/prisma";
import { downloadAiStudyObject } from "@/lib/ai-study-storage";
import { refreshAiStudyProgressCache, writeAiStudyTaskProgressCache } from "@/lib/ai-study-progress-cache";
import { getAiStudyPromptConfig, type AiStudyPromptConfig } from "@/lib/ai-study-prompts";

const outlineTimeoutMs = Number(process.env.AI_STUDY_OUTLINE_TIMEOUT_MS || 120_000);
const cardTimeoutMs = Number(process.env.AI_STUDY_CARD_TIMEOUT_MS || 120_000);
const maxNodesPerProject = Number(process.env.AI_STUDY_MAX_NODES_PER_PROJECT || 60);
const maxOutlineSourceChars = Number(process.env.AI_STUDY_OUTLINE_SOURCE_CHARS || 50_000);
const maxCardSourceChars = Number(process.env.AI_STUDY_CARD_SOURCE_CHARS || 8_000);
const maxParsedTextChars = Number(process.env.AI_STUDY_MAX_PARSED_TEXT_CHARS || 200_000);
const queueFallbackScanMs = Number(process.env.AI_STUDY_QUEUE_FALLBACK_SCAN_MS || 60_000);
let lastQueueFallbackScanAt = 0;

const outlineNodeSchema = z.object({
  clientId: z.string().trim().min(1).max(80),
  parentClientId: z.string().trim().min(1).max(80).nullable().optional(),
  title: z.string().trim().min(1).max(80),
  summary: z.string().trim().min(1).max(600),
  sourceChunkIds: z.array(z.string().trim().min(1)).min(1).max(24)
});

const outlineSchema = z.object({
  nodes: z.array(outlineNodeSchema).min(1)
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

type OutlineNode = z.infer<typeof outlineNodeSchema> & {
  depth: number;
  sortOrder: number;
};

type GeneratedCard = z.infer<typeof cardSchema> & {
  nodeId: string;
};

type SupportedParsedSourceType = "pdf" | "document";

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
    if (task.sourceId) {
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
    throw new Error(`当前 parse_source 只支持 PDF 或 Word，收到 ${source.sourceType}。`);
  }
  if (!source.storageKey) {
    throw new Error("学习资料缺少 MinIO storageKey。");
  }

  await updateAiStudyTaskStage(task, "downloading_source");

  const object = await downloadAiStudyObject(source.storageKey);

  await updateAiStudyTaskStage(task, "extracting_source_text");

  const parsed = await extractSourceText(source.sourceType, object.body);
  const text = normalizeParsedText(parsed.text).slice(0, maxParsedTextChars);
  const chunks = buildAiStudyTextChunks(text);

  if (chunks.length === 0) {
    throw new Error("学习资料未解析出可学习文本。");
  }

  let nextTask: AiStudyGenerationTask | null = null;
  await prisma.$transaction(async (tx) => {
    await tx.aiStudySourceChunk.deleteMany({ where: { sourceId: source.id } });
    await tx.aiStudySourceChunk.createMany({
      data: chunks.map((content, chunkIndex) => ({
        projectId: source.projectId,
        sourceId: source.id,
        pageNumber: null,
        chunkIndex,
        content
      }))
    });

    await tx.aiStudySource.update({
      where: { id: source.id },
      data: {
        textContent: text,
        pageCount: parsed.pageCount,
        status: "parsed"
      }
    });

    await tx.aiStudyGenerationTask.update({
      where: { id: task.id },
      data: {
        status: "succeeded",
        stage: "source_text_extracted",
        outputSummary: {
          sourceType: source.sourceType,
          pageCount: parsed.pageCount,
          chunkCount: chunks.length,
          textLength: text.length
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
          textLength: text.length
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

async function extractSourceText(sourceType: SupportedParsedSourceType, body: Buffer) {
  if (sourceType === "pdf") {
    const parsed = await pdfParse(body);
    return {
      text: parsed.text,
      pageCount: parsed.numpages || null
    };
  }

  const extractor = new WordExtractor();
  const document = await extractor.extract(body);
  return {
    text: [
      document.getBody(),
      document.getFootnotes(),
      document.getEndnotes(),
      document.getHeaders({ includeFooters: false }),
      document.getFooters(),
      document.getAnnotations(),
      document.getTextboxes()
    ].map((section) => section.trim()).filter(Boolean).join("\n\n"),
    pageCount: null
  };
}

function isSupportedParsedSourceType(sourceType: string): sourceType is SupportedParsedSourceType {
  return sourceType === "pdf" || sourceType === "document";
}

async function generateOutline(task: AiStudyGenerationTask) {
  const project = await prisma.aiStudyProject.findUnique({
    where: { id: task.projectId },
    include: {
      sourceChunks: {
        orderBy: [{ sourceId: "asc" }, { chunkIndex: "asc" }]
      }
    }
  });

  if (!project || project.deletedAt) {
    throw new Error("学习项目不存在或已删除。");
  }
  if (project.sourceChunks.length === 0) {
    throw new Error("学习项目没有可生成的原文片段。");
  }

  await updateAiStudyTaskStage(task, "generating_outline");

  const promptConfig = await getAiStudyPromptConfig();
  const promptVersion = promptConfig.version;
  const responseText = await askQwen(buildOutlineMessages(project.title, project.sourceChunks, promptConfig), {
    temperature: 0.2,
    timeoutMs: outlineTimeoutMs
  });
  const outline = parseJsonWithSchema(responseText, outlineSchema, "知识框架 JSON 格式不合法。");
  const preparedNodes = prepareOutlineNodes(outline.nodes, project.sourceChunks, project.title);

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
        outputSummary: {
          nodeCount: preparedNodes.length,
          promptVersion
        },
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
      },
      sourceChunks: true
    }
  });

  if (!project || project.deletedAt) {
    throw new Error("学习项目不存在或已删除。");
  }

  const nodes = project.nodes.filter((node) => node.cards.length === 0);
  const promptConfig = await getAiStudyPromptConfig();
  const promptVersion = promptConfig.version;
  if (nodes.length === 0) {
    await markAiStudyTaskSucceeded(task.id, { cardCount: 0, promptVersion });
    await prisma.aiStudyProject.update({
      where: { id: project.id },
      data: { status: "ready" }
    });
    await refreshAiStudyProgressCache(project.id);
    return;
  }

  const chunksById = new Map(project.sourceChunks.map((chunk) => [chunk.id, chunk]));
  const generatedCards: GeneratedCard[] = [];

  for (const [index, node] of nodes.entries()) {
    await updateAiStudyTaskStage(task, `generating_card_${index + 1}_of_${nodes.length}`);

    const sourceChunks = node.depth === 0 ? project.sourceChunks : getNodeSourceChunks(node, chunksById);
    const responseText = await askQwen(buildCardMessages(project.title, node, sourceChunks, promptConfig), {
      temperature: 0.2,
      timeoutMs: cardTimeoutMs
    });
    const card = parseGeneratedCard(responseText, node);
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
          reviewStatus: "unreviewed"
        }
      });
    }

    await tx.aiStudyGenerationTask.update({
      where: { id: task.id },
      data: {
        status: "succeeded",
        stage: "cards_generated",
        outputSummary: {
          cardCount: generatedCards.length,
          promptVersion
        },
        finishedAt: new Date(),
        errorMessage: null
      }
    });

    await tx.aiStudyProject.update({
      where: { id: project.id },
      data: { status: "ready" }
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

function buildOutlineMessages(
  projectTitle: string,
  chunks: AiStudySourceChunk[],
  promptConfig: AiStudyPromptConfig
): ChatMessage[] {
  const sourceChunks = formatChunksForPrompt(chunks, maxOutlineSourceChars);
  return [
    {
      role: "system",
      content: promptConfig.render("outline.system", { maxNodesPerProject })
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
  chunks: AiStudySourceChunk[],
  promptConfig: AiStudyPromptConfig
): ChatMessage[] {
  const level = node.depth + 1;
  const cardInstruction = getCardInstruction(level, promptConfig);
  const sourceChunks = formatChunksForPrompt(chunks, maxCardSourceChars);
  return [
    {
      role: "system",
      content: promptConfig.render("card.system")
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

function getCardInstruction(level: number, promptConfig: AiStudyPromptConfig) {
  if (level === 1) {
    return promptConfig.render("card.instruction.level1");
  }

  if (level === 2 || level === 3) {
    return promptConfig.render("card.instruction.level2_3");
  }

  return promptConfig.render("card.instruction.level4");
}

function prepareOutlineNodes(nodes: z.infer<typeof outlineNodeSchema>[], chunks: AiStudySourceChunk[], projectTitle: string): OutlineNode[] {
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

  return normalizedNodes
    .map((node, sortOrder) => {
      const sourceChunkIds = resolveOutlineSourceChunkIds(node, normalizedNodes, validChunkIds, chunks);
      return {
        ...node,
        parentClientId: node.parentClientId || null,
        sourceChunkIds,
        depth: resolveDepth(node),
        sortOrder
      };
    })
    .sort((left, right) => left.depth - right.depth || left.sortOrder - right.sortOrder);
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
  nodes: z.infer<typeof outlineNodeSchema>[],
  validChunkIds: Set<string>,
  chunks: AiStudySourceChunk[]
) {
  const directChunkIds = normalizeOutlineSourceChunkIds(node.sourceChunkIds, validChunkIds);
  if (directChunkIds.length > 0) {
    return directChunkIds;
  }

  const titleMatchedChunkIds = findOutlineChunksByTitle(node.title, chunks);
  if (titleMatchedChunkIds.length > 0) {
    return titleMatchedChunkIds;
  }

  const inheritedChunkIds = findAncestorOutlineSourceChunkIds(node, nodes, validChunkIds);
  if (inheritedChunkIds.length > 0) {
    return inheritedChunkIds;
  }

  return chunks.slice(0, 1).map((chunk) => chunk.id);
}

function normalizeOutlineSourceChunkIds(sourceChunkIds: string[], validChunkIds: Set<string>) {
  return Array.from(new Set(sourceChunkIds.filter((id) => validChunkIds.has(id)))).slice(0, 24);
}

function findAncestorOutlineSourceChunkIds(
  node: z.infer<typeof outlineNodeSchema>,
  nodes: z.infer<typeof outlineNodeSchema>[],
  validChunkIds: Set<string>
) {
  const nodeByClientId = new Map(nodes.map((candidate) => [candidate.clientId, candidate]));
  let current = node.parentClientId ? nodeByClientId.get(node.parentClientId) : null;

  while (current) {
    const sourceChunkIds = normalizeOutlineSourceChunkIds(current.sourceChunkIds, validChunkIds);
    if (sourceChunkIds.length > 0) {
      return sourceChunkIds.slice(0, 8);
    }
    current = current.parentClientId ? nodeByClientId.get(current.parentClientId) : null;
  }

  return [];
}

function findOutlineChunksByTitle(title: string, chunks: AiStudySourceChunk[]) {
  const normalizedTitle = normalizeOutlineMatchText(title);
  if (normalizedTitle.length < 2) {
    return [];
  }

  return chunks
    .filter((chunk) => normalizeOutlineMatchText(chunk.content).includes(normalizedTitle))
    .slice(0, 4)
    .map((chunk) => chunk.id);
}

function normalizeOutlineMatchText(value: string) {
  return value.replace(/\s+/g, "").toLowerCase();
}

function ensureSingleRootNode(nodes: z.infer<typeof outlineNodeSchema>[], chunks: AiStudySourceChunk[], projectTitle: string) {
  const roots = nodes.filter((node) => !node.parentClientId);
  if (roots.length === 1) {
    return nodes;
  }

  const rootClientId = "__project_root";
  const rootSummary = roots.length > 0
    ? roots.map((node) => node.summary).join("；").slice(0, 600)
    : "整份学习资料的核心内容总览。";
  const rootChunkIds = chunks.slice(0, 24).map((chunk) => chunk.id);

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

function getNodeSourceChunks(node: AiStudyNode, chunksById: Map<string, AiStudySourceChunk>) {
  const chunkIds = Array.isArray(node.sourceChunkIds) ? node.sourceChunkIds.filter((value): value is string => typeof value === "string") : [];
  const chunks = chunkIds.map((id) => chunksById.get(id)).filter((chunk): chunk is AiStudySourceChunk => Boolean(chunk));
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

function formatChunksForPrompt(chunks: AiStudySourceChunk[], maxChars: number) {
  let used = 0;
  const lines: string[] = [];
  for (const chunk of chunks) {
    const header = `[sourceChunkId=${chunk.id}; chunkIndex=${chunk.chunkIndex}${chunk.pageNumber ? `; page=${chunk.pageNumber}` : ""}]`;
    const remaining = maxChars - used;
    if (remaining <= 0) {
      break;
    }
    const content = chunk.content.slice(0, remaining);
    used += content.length;
    lines.push(`${header}\n${content}`);
  }
  return lines.join("\n\n---\n\n");
}

function normalizeParsedText(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
