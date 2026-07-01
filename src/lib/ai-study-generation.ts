import { z } from "zod";
import type { AiStudyGenerationTask, AiStudyNode, AiStudySourceChunk } from "@prisma/client";
import pdfParse from "pdf-parse";
import { buildAiStudyTextChunks, markAiStudyTaskFailed, markAiStudyTaskSucceeded } from "@/lib/ai-study";
import { askQwen, type ChatMessage } from "@/lib/qwen";
import { prisma } from "@/lib/prisma";
import { downloadAiStudyObject } from "@/lib/ai-study-storage";

const promptVersion = "ai-study-v2-four-level-map-2026-07-01";
const outlineTimeoutMs = Number(process.env.AI_STUDY_OUTLINE_TIMEOUT_MS || 120_000);
const cardTimeoutMs = Number(process.env.AI_STUDY_CARD_TIMEOUT_MS || 120_000);
const maxNodesPerProject = Number(process.env.AI_STUDY_MAX_NODES_PER_PROJECT || 60);
const maxOutlineSourceChars = Number(process.env.AI_STUDY_OUTLINE_SOURCE_CHARS || 50_000);
const maxCardSourceChars = Number(process.env.AI_STUDY_CARD_SOURCE_CHARS || 8_000);
const maxParsedTextChars = Number(process.env.AI_STUDY_MAX_PARSED_TEXT_CHARS || 200_000);

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

export async function runAiStudyWorkerCycle(batchSize = Number(process.env.AI_STUDY_WORKER_BATCH_SIZE || 1)) {
  const tasks = await prisma.aiStudyGenerationTask.findMany({
    where: {
      status: "pending",
      type: {
        in: ["parse_source", "generate_outline", "generate_cards"]
      }
    },
    orderBy: { createdAt: "asc" },
    take: Math.max(1, batchSize)
  });

  let processed = 0;
  for (const task of tasks) {
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
      continue;
    }

    try {
      await processAiStudyTask(task.id);
      processed += 1;
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
      processed += 1;
    }
  }

  return { processed };
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
  if (source.sourceType !== "pdf") {
    throw new Error(`当前 parse_source 只支持 PDF，收到 ${source.sourceType}。`);
  }
  if (!source.storageKey) {
    throw new Error("PDF 资料缺少 MinIO storageKey。");
  }

  await prisma.aiStudyGenerationTask.update({
    where: { id: task.id },
    data: { stage: "downloading_pdf" }
  });

  const object = await downloadAiStudyObject(source.storageKey);

  await prisma.aiStudyGenerationTask.update({
    where: { id: task.id },
    data: { stage: "extracting_pdf_text" }
  });

  const parsed = await pdfParse(object.body);
  const text = normalizeParsedText(parsed.text).slice(0, maxParsedTextChars);
  const chunks = buildAiStudyTextChunks(text);

  if (chunks.length === 0) {
    throw new Error("PDF 未解析出可学习文本。");
  }

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
        pageCount: parsed.numpages || null,
        status: "parsed"
      }
    });

    await tx.aiStudyGenerationTask.update({
      where: { id: task.id },
      data: {
        status: "succeeded",
        stage: "pdf_text_extracted",
        outputSummary: {
          pageCount: parsed.numpages || null,
          chunkCount: chunks.length,
          textLength: text.length
        },
        finishedAt: new Date(),
        errorMessage: null
      }
    });

    await tx.aiStudyGenerationTask.create({
      data: {
        projectId: source.projectId,
        sourceId: source.id,
        type: "generate_outline",
        stage: "waiting_for_ai_generation",
        inputSummary: {
          sourceType: "pdf",
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

  await prisma.aiStudyGenerationTask.update({
    where: { id: task.id },
    data: { stage: "generating_outline" }
  });

  const responseText = await askQwen(buildOutlineMessages(project.title, project.sourceChunks), {
    temperature: 0.2,
    timeoutMs: outlineTimeoutMs
  });
  const outline = parseJsonWithSchema(responseText, outlineSchema, "知识框架 JSON 格式不合法。");
  const preparedNodes = prepareOutlineNodes(outline.nodes, project.sourceChunks, project.title);

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

    await tx.aiStudyGenerationTask.create({
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
  if (nodes.length === 0) {
    await markAiStudyTaskSucceeded(task.id, { cardCount: 0, promptVersion });
    await prisma.aiStudyProject.update({
      where: { id: project.id },
      data: { status: "ready" }
    });
    return;
  }

  const chunksById = new Map(project.sourceChunks.map((chunk) => [chunk.id, chunk]));
  const generatedCards: GeneratedCard[] = [];

  for (const [index, node] of nodes.entries()) {
    await prisma.aiStudyGenerationTask.update({
      where: { id: task.id },
      data: { stage: `generating_card_${index + 1}_of_${nodes.length}` }
    });

    const sourceChunks = node.depth === 0 ? project.sourceChunks : getNodeSourceChunks(node, chunksById);
    const responseText = await askQwen(buildCardMessages(project.title, node, sourceChunks), {
      temperature: 0.2,
      timeoutMs: cardTimeoutMs
    });
    const card = parseJsonWithSchema(responseText, cardSchema, `知识卡片 JSON 格式不合法：${node.title}`);
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
}

function buildOutlineMessages(projectTitle: string, chunks: AiStudySourceChunk[]): ChatMessage[] {
  return [
    {
      role: "system",
      content: [
        "你是面向中国学生的 AI 学习搭子资料解析助手。",
        "你只能基于用户提供的原文片段生成知识图谱，不允许补充原文外知识。",
        "目标不是照抄目录，而是把资料重组为学生可点击学习的思维导图。",
        "最多四层：第1层=项目标题；第2层=具体章节；第3层=章节核心内容；第4层=具体知识点。",
        "第1层必须只有一个根节点，根节点标题使用项目名称或资料主题。",
        "如果原文内容不足四层，可以少于四层，但绝不能超过四层。",
        "节点标题要短，适合展示在思维导图节点里；summary 要说明该节点覆盖什么内容。",
        "必须输出严格 JSON，不要 Markdown，不要代码块，不要解释 JSON 之外的内容。",
        "JSON 结构固定为：{\"nodes\":[{\"clientId\":\"n1\",\"parentClientId\":null,\"title\":\"标题\",\"summary\":\"概述\",\"sourceChunkIds\":[\"chunk_id\"]}]}。",
        "每个节点必须至少引用 1 个真实 sourceChunkIds。最多输出 " + maxNodesPerProject + " 个节点。"
      ].join("\n")
    },
    {
      role: "user",
      content: [
        `项目名称：${projectTitle}`,
        "请将资料拆成适合学习的四层以内知识图谱，父节点用 parentClientId 指向另一个 clientId。",
        "推荐结构：项目标题 -> 单元/章节 -> 核心主题 -> 具体知识点。",
        "具体知识点应聚焦可解释、可学习的概念、事件、制度、公式、方法或结论。",
        "不要生成知识闪卡，不要生成测验题。",
        "原文片段如下：",
        formatChunksForPrompt(chunks, maxOutlineSourceChars)
      ].join("\n\n")
    }
  ];
}

function buildCardMessages(projectTitle: string, node: AiStudyNode, chunks: AiStudySourceChunk[]): ChatMessage[] {
  const level = node.depth + 1;
  const cardInstruction = getCardInstruction(level);
  return [
    {
      role: "system",
      content: [
        "你是面向中国学生的 AI 学习搭子讲解助手。",
        "你只能基于当前节点绑定的原文片段生成知识卡片，不允许编造来源外内容。",
        "输出要适合学生直接阅读：清楚、具体、克制，能帮助学生理解资料。",
        "知识闪卡功能暂不实现，flashcards 必须输出空数组。pitfalls 和 examples 也输出空数组。",
        "必须输出严格 JSON，不要 Markdown，不要代码块，不要解释 JSON 之外的内容。",
        "JSON 结构固定为：{\"overview\":\"...\",\"explanation\":\"...\",\"keyPoints\":[\"...\"],\"pitfalls\":[],\"examples\":[],\"flashcards\":[]}。"
      ].join("\n")
    },
    {
      role: "user",
      content: [
        `项目名称：${projectTitle}`,
        `当前节点层级：第 ${level} 层`,
        `当前节点标题：${node.title}`,
        `当前节点概述：${node.summary}`,
        cardInstruction,
        "原文片段如下：",
        formatChunksForPrompt(chunks, maxCardSourceChars)
      ].join("\n\n")
    }
  ];
}

function getCardInstruction(level: number) {
  if (level === 1) {
    return [
      "请生成项目总览卡片：",
      "overview 字段写“内容概述”，总结整篇资料的主要内容。",
      "keyPoints 字段写“你能学到啥”，提炼学习完本资料可以掌握的知识或能力，3-6 条。",
      "explanation 字段输出空字符串。"
    ].join("\n");
  }

  if (level === 2 || level === 3) {
    return [
      "请生成章节/主题卡片：",
      "overview 字段写“内容概述”，总结本章或本节内容。",
      "keyPoints 字段写“本节知识点”，提炼本章或本节最重要的知识点，3-8 条。",
      "explanation 字段输出空字符串。"
    ].join("\n");
  }

  return [
    "请生成具体知识点卡片：",
    "overview 字段写“内容概述”，总结这个知识点在原文中的含义和范围。",
    "explanation 字段写“AI详解”，用更容易理解的语言解释该知识点的背景、因果、关键词和考试记忆线索。",
    "keyPoints 字段可以输出 0-3 条关键词，但前端本阶段不会展示。"
  ].join("\n");
}

function prepareOutlineNodes(nodes: z.infer<typeof outlineNodeSchema>[], chunks: AiStudySourceChunk[], projectTitle: string): OutlineNode[] {
  const normalizedNodes = ensureSingleRootNode(nodes, chunks, projectTitle);

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
      const sourceChunkIds = Array.from(new Set(node.sourceChunkIds.filter((id) => validChunkIds.has(id))));
      if (sourceChunkIds.length === 0) {
        throw new Error(`知识节点缺少有效来源片段：${node.title}`);
      }
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
