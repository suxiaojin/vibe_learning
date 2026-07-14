import { randomUUID } from "crypto";
import { z } from "zod";
import type { AiStudyGenerationTask, AiStudyProgressStatus, AiStudyTaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { uploadAiStudyObject } from "@/lib/ai-study-storage";
import { enqueueAiStudyTask } from "@/lib/ai-study-task-queue";
import {
  attachAiStudyGenerationProgress,
  clearAiStudyProgressCache,
  getAiStudyProjectGenerationProgress,
  refreshAiStudyProgressCache,
  writeAiStudyTaskProgressCache
} from "@/lib/ai-study-progress-cache";
import { askQwen, streamQwen, type ChatMessage } from "@/lib/qwen";
import { getAiStudyPromptConfig, type AiStudyPromptConfig } from "@/lib/ai-study-prompts";
import {
  consumeDiamondsByRule,
  InsufficientDiamondBalanceError
} from "@/lib/rewards";

const sourceTypeSchema = z.enum(["pdf", "document", "image", "text", "mixed"]);
const learningGoalSchema = z.enum(["preview", "review", "sprint", "weak_point", "other"]);
const projectStatusSchema = z.enum(["draft", "processing", "ready", "failed", "archived"]);
const progressStatusSchema = z.enum(["not_started", "learning", "review_needed", "mastered"]);

const createProjectSchema = z.object({
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).optional().nullable(),
  sourceType: sourceTypeSchema.default("text"),
  learningGoal: learningGoalSchema.default("review"),
  courseId: z.string().trim().min(1).optional().nullable(),
  textContent: z.string().trim().min(1).max(200_000).optional().nullable()
});

const listProjectsSchema = z.object({
  status: projectStatusSchema.optional().nullable()
});

const updateProjectSchema = z.object({
  title: z.string().trim().min(1).max(35)
});

const updateNodeSchema = z.object({
  title: z.string().trim().min(1).max(120)
});

const updateProgressSchema = z.object({
  status: progressStatusSchema
});

const aiStudyBuddyChatSchema = z.object({
  message: z.string().trim().min(1).max(1000),
  nodeId: z.string().trim().min(1).optional().nullable()
});
const aiStudyChatMessageRoleSchema = z.enum(["assistant", "user"]);

const MAX_AI_STUDY_RETRY_COUNT = 3;

type UploadedSourceInput = {
  fileName: string;
  mimeType: string;
  size: number;
  body: Buffer;
  startParsing?: boolean;
};

type UploadableSourceType = "pdf" | "document";

export class AiStudyError extends Error {
  constructor(message: string, readonly status = 400, readonly code = "AI_STUDY_ERROR") {
    super(message);
    this.name = "AiStudyError";
  }
}

export function formatAiStudyError(error: unknown) {
  if (error instanceof AiStudyError) {
    return { message: error.message, status: error.status, code: error.code };
  }
  return null;
}

function rethrowAiStudyDiamondError(error: unknown): never {
  if (error instanceof InsufficientDiamondBalanceError) {
    throw new AiStudyError(
      "钻石不足，请充值后再试。",
      402,
      "AI_STUDY_INSUFFICIENT_DIAMONDS"
    );
  }
  throw error;
}

export async function listAiStudyProjects(ownerId: string, input: unknown = {}) {
  const parsed = parseAiStudyInput(listProjectsSchema, input, "项目筛选参数不合法。");
  const projects = await prisma.aiStudyProject.findMany({
    where: {
      ownerId,
      deletedAt: null,
      ...(parsed.status ? { status: parsed.status } : {})
    },
    orderBy: [{ createdAt: "desc" }],
    include: {
      nodes: {
        where: { depth: 0 },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        take: 1,
        select: {
          summary: true,
          cards: {
            orderBy: { createdAt: "asc" },
            take: 1,
            select: {
              overview: true
            }
          }
        }
      },
      _count: {
        select: {
          sources: true,
          nodes: true,
          tasks: true
        }
      }
    }
  });
  const projectsWithProgress = await attachAiStudyGenerationProgress(projects, { loadTasksOnMiss: true });
  const failedProjectIds = projectsWithProgress.filter((project) => project.status === "failed").map((project) => project.id);
  if (failedProjectIds.length === 0) {
    return projectsWithProgress.map((project) => ({ ...project, latestFailedRetryCount: 0 }));
  }

  const latestFailedTaskMap = new Map<string, number>();
  const failedTasks = await prisma.aiStudyGenerationTask.findMany({
    where: {
      projectId: { in: failedProjectIds },
      status: "failed",
      type: { in: ["parse_source", "generate_outline", "generate_cards"] }
    },
    orderBy: [{ projectId: "asc" }, { createdAt: "desc" }],
    select: {
      projectId: true,
      retryCount: true
    }
  });

  for (const task of failedTasks) {
    if (!latestFailedTaskMap.has(task.projectId)) {
      latestFailedTaskMap.set(task.projectId, task.retryCount);
    }
  }

  return projectsWithProgress.map((project) => ({
    ...project,
    latestFailedRetryCount: latestFailedTaskMap.get(project.id) ?? 0
  }));
}

export async function listPublicAiStudyProjects(input: { take?: number } = {}) {
  const take = typeof input.take === "number" ? Math.max(1, Math.min(input.take, 200)) : undefined;
  const projects = await prisma.aiStudyProject.findMany({
    where: {
      visibility: "public",
      status: "ready",
      deletedAt: null
    },
    orderBy: [{ createdAt: "desc" }],
    ...(take ? { take } : {}),
    include: {
      nodes: {
        where: { depth: 0 },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        take: 1,
        select: {
          summary: true,
          cards: {
            orderBy: { createdAt: "asc" },
            take: 1,
            select: {
              overview: true
            }
          }
        }
      },
      owner: {
        select: {
          id: true,
          username: true,
          studentProfile: {
            select: {
              nickname: true
            }
          }
        }
      },
      _count: {
        select: {
          sources: true,
          nodes: true,
          tasks: true
        }
      }
    }
  });
  return attachAiStudyGenerationProgress(projects, { loadTasksOnMiss: false });
}

export async function createAiStudyProject(ownerId: string, input: unknown) {
  const parsed = parseAiStudyInput(createProjectSchema, input, "学习项目参数不合法。");
  await assertProjectCreateLimit(ownerId);
  await assertCourseExists(parsed.courseId || null);

  const textContent = parsed.textContent?.trim() || "";
  const sourceType = parsed.sourceType ?? "text";
  const learningGoal = parsed.learningGoal ?? "review";
  const status = textContent ? "processing" : "draft";
  let taskToQueue: AiStudyGenerationTask | null = null;

  const project = await prisma.$transaction(async (tx) => {
    const project = await tx.aiStudyProject.create({
      data: {
        ownerId,
        title: parsed.title,
        description: parsed.description || null,
        sourceType: textContent ? "text" : sourceType,
        learningGoal,
        courseId: parsed.courseId || null,
        status
      }
    });

    if (!textContent) {
      return project;
    }

    const source = await tx.aiStudySource.create({
      data: {
        projectId: project.id,
        sourceType: "text",
        fileName: null,
        mimeType: "text/plain",
        fileSizeBytes: Buffer.byteLength(textContent, "utf8"),
        textContent,
        status: "parsed"
      }
    });

    const chunks = buildAiStudyTextChunks(textContent).map((content, chunkIndex) => ({
      projectId: project.id,
      sourceId: source.id,
      chunkIndex,
      content
    }));

    if (chunks.length > 0) {
      await tx.aiStudySourceChunk.createMany({ data: chunks });
    }

    await consumeDiamondsByRule(tx, {
      userId: ownerId,
      ruleKey: "ai_study_project_create",
      dedupeKey: `ai_study_project_create:${project.id}`,
      note: "学习搭子：创建项目",
      metadata: {
        projectId: project.id,
        sourceId: source.id,
        sourceType: "text"
      }
    });

    taskToQueue = await tx.aiStudyGenerationTask.create({
      data: {
        projectId: project.id,
        sourceId: source.id,
        type: "generate_outline",
        stage: "waiting_for_ai_generation",
        inputSummary: {
          sourceType: "text",
          chunkCount: chunks.length,
          textLength: textContent.length
        }
      }
    });

    return project;
  }).catch(rethrowAiStudyDiamondError);

  await enqueueAiStudyTask(taskToQueue);
  if (taskToQueue) {
    await writeAiStudyTaskProgressCache(taskToQueue);
  }
  return project;
}

export async function getAiStudyProject(ownerId: string, projectId: string) {
  const project = await prisma.aiStudyProject.findFirst({
    where: accessibleProjectWhere(ownerId, projectId),
    include: {
      sources: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          sourceType: true,
          fileName: true,
          mimeType: true,
          fileSizeBytes: true,
          storageBucket: true,
          storageKey: true,
          storagePath: true,
          pageCount: true,
          status: true,
          createdAt: true
        }
      },
      tasks: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          projectId: true,
          sourceId: true,
          type: true,
          status: true,
          stage: true,
          errorMessage: true,
          retryCount: true,
          startedAt: true,
          finishedAt: true,
          createdAt: true,
          updatedAt: true
        }
      },
      _count: {
        select: {
          sourceChunks: true,
          nodes: true,
          cards: true
        }
      }
    }
  });

  if (!project) {
    throw new AiStudyError("学习项目不存在。", 404, "AI_STUDY_PROJECT_NOT_FOUND");
  }

  const [projectWithProgress] = await attachAiStudyGenerationProgress([project]);
  return projectWithProgress;
}

export async function deleteAiStudyProject(ownerId: string, projectId: string) {
  const result = await prisma.aiStudyProject.deleteMany({
    where: {
      id: projectId,
      ownerId
    }
  });

  if (result.count === 0) {
    throw new AiStudyError("学习项目不存在。", 404, "AI_STUDY_PROJECT_NOT_FOUND");
  }

  await clearAiStudyProgressCache(projectId);
  return { deleted: true };
}

export async function updateAiStudyProject(ownerId: string, projectId: string, input: unknown) {
  const parsed = parseAiStudyInput(updateProjectSchema, input, "学习项目参数不合法。");
  const result = await prisma.aiStudyProject.updateMany({
    where: {
      id: projectId,
      ownerId,
      deletedAt: null
    },
    data: {
      title: parsed.title
    }
  });

  if (result.count === 0) {
    throw new AiStudyError("学习项目不存在。", 404, "AI_STUDY_PROJECT_NOT_FOUND");
  }

  return getAiStudyProject(ownerId, projectId);
}

export async function uploadAiStudySource(ownerId: string, projectId: string, input: UploadedSourceInput) {
  const project = await assertOwnedProject(ownerId, projectId);
  const shouldStartParsing = input.startParsing !== false;
  const maxFileBytes = getMaxFileBytes();
  if (input.size <= 0) {
    throw new AiStudyError("上传文件不能为空。", 400, "AI_STUDY_EMPTY_FILE");
  }
  if (input.size > maxFileBytes) {
    throw new AiStudyError(`上传文件不能超过 ${Math.floor(maxFileBytes / 1024 / 1024)}MB。`, 413, "AI_STUDY_FILE_TOO_LARGE");
  }
  const sourceFile = getSupportedUploadSource(input.fileName, input.mimeType);
  if (!sourceFile) {
    throw new AiStudyError("当前阶段仅支持上传 PDF、Word（.doc/.docx）文件。", 400, "AI_STUDY_UNSUPPORTED_FILE_TYPE");
  }

  const sourceId = randomUUID();
  const safeFileName = sanitizeFileName(input.fileName) || sourceFile.defaultFileName;
  const storageKey = `ai-study/${ownerId}/${project.id}/${sourceId}/${safeFileName}`;
  const uploaded = await uploadAiStudyObject({
    key: storageKey,
    body: input.body,
    contentType: sourceFile.mimeType
  });

  const result = await prisma.$transaction(async (tx) => {
    if (shouldStartParsing) {
      const claimed = await tx.aiStudyProject.updateMany({
        where: {
          id: project.id,
          ownerId,
          status: "draft",
          deletedAt: null
        },
        data: {
          sourceType: mergeUploadedSourceType(project.sourceType, sourceFile.sourceType),
          status: "processing"
        }
      });
      if (claimed.count !== 1) {
        throw new AiStudyError("项目已经在解析中。", 400, "AI_STUDY_PROJECT_PROCESSING");
      }
    }

    const source = await tx.aiStudySource.create({
      data: {
        id: sourceId,
        projectId: project.id,
        sourceType: sourceFile.sourceType,
        fileName: input.fileName,
        mimeType: sourceFile.mimeType,
        fileSizeBytes: input.size,
        storageBucket: uploaded.bucket,
        storageKey: uploaded.key,
        storagePath: uploaded.storagePath,
        status: "uploaded"
      }
    });

    if (shouldStartParsing) {
      await consumeDiamondsByRule(tx, {
        userId: ownerId,
        ruleKey: "ai_study_project_create",
        dedupeKey: `ai_study_project_create:${project.id}`,
        note: "学习搭子：创建项目",
        metadata: {
          projectId: project.id,
          sourceId: source.id,
          sourceType: source.sourceType
        }
      });
    }

    const task = shouldStartParsing
      ? await tx.aiStudyGenerationTask.create({
          data: {
            projectId: project.id,
            sourceId: source.id,
            type: "parse_source",
            stage: "waiting_for_source_parse",
            inputSummary: {
              fileName: input.fileName,
              sourceType: sourceFile.sourceType,
              mimeType: sourceFile.mimeType,
              fileSizeBytes: input.size,
              storagePath: uploaded.storagePath
            }
          }
        })
      : null;

    if (!shouldStartParsing) {
      await tx.aiStudyProject.update({
        where: { id: project.id },
        data: {
          sourceType: mergeUploadedSourceType(project.sourceType, sourceFile.sourceType)
        }
      });
    }

    return { source, task };
  }).catch(rethrowAiStudyDiamondError);

  await enqueueAiStudyTask(result.task);
  if (result.task) {
    await writeAiStudyTaskProgressCache(result.task);
  }
  return result;
}

export async function startAiStudyProjectGeneration(ownerId: string, projectId: string) {
  const project = await prisma.aiStudyProject.findFirst({
    where: {
      id: projectId,
      ownerId,
      deletedAt: null
    },
    include: {
      sources: {
        where: {
          sourceType: { in: ["pdf", "document"] },
          status: "uploaded"
        },
        orderBy: { createdAt: "desc" },
        take: 1
      },
      tasks: {
        where: {
          status: { in: ["pending", "running"] }
        },
        take: 1
      }
    }
  });

  if (!project) {
    throw new AiStudyError("学习项目不存在。", 404, "AI_STUDY_PROJECT_NOT_FOUND");
  }
  if (project.status === "processing") {
    throw new AiStudyError("项目已经在解析中。", 400, "AI_STUDY_PROJECT_PROCESSING");
  }
  if (project.status === "ready") {
    throw new AiStudyError("项目已经解析完成。", 400, "AI_STUDY_PROJECT_READY");
  }
  if (project.status === "failed") {
    throw new AiStudyError("项目已失败，请使用重新解析。", 400, "AI_STUDY_PROJECT_FAILED");
  }
  if (project.tasks.length > 0) {
    throw new AiStudyError("项目已有待处理任务，请稍后刷新。", 400, "AI_STUDY_TASK_ALREADY_RUNNING");
  }

  const source = project.sources[0];
  if (!source) {
    throw new AiStudyError("请先上传学习资料。", 400, "AI_STUDY_SOURCE_REQUIRED");
  }

  let task: AiStudyGenerationTask;
  try {
    task = await prisma.$transaction(async (tx) => {
      const claimed = await tx.aiStudyProject.updateMany({
        where: {
          id: project.id,
          ownerId,
          status: "draft",
          deletedAt: null
        },
        data: {
          status: "processing"
        }
      });
      if (claimed.count !== 1) {
        throw new AiStudyError("项目已经在解析中。", 400, "AI_STUDY_PROJECT_PROCESSING");
      }

      await consumeDiamondsByRule(tx, {
        userId: ownerId,
        ruleKey: "ai_study_project_create",
        dedupeKey: `ai_study_project_create:${project.id}`,
        note: "学习搭子：创建项目",
        metadata: {
          projectId: project.id,
          sourceId: source.id,
          sourceType: source.sourceType
        }
      });

      const sourceMimeType = source.mimeType || getDefaultMimeTypeForSourceType(source.sourceType);
      return tx.aiStudyGenerationTask.create({
        data: {
          projectId: project.id,
          sourceId: source.id,
          type: "parse_source",
          stage: "waiting_for_source_parse",
          inputSummary: {
            fileName: source.fileName,
            sourceType: source.sourceType,
            mimeType: sourceMimeType,
            fileSizeBytes: source.fileSizeBytes,
            storagePath: source.storagePath
          }
        }
      });
    });
  } catch (error) {
    rethrowAiStudyDiamondError(error);
  }

  await enqueueAiStudyTask(task);
  await writeAiStudyTaskProgressCache(task);
  return { task };
}

export async function listAiStudyProjectTasks(ownerId: string, projectId: string) {
  await assertOwnedProject(ownerId, projectId);
  return prisma.aiStudyGenerationTask.findMany({
    where: { projectId },
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      projectId: true,
      sourceId: true,
      type: true,
      status: true,
      stage: true,
      inputSummary: true,
      outputSummary: true,
      errorMessage: true,
      retryCount: true,
      startedAt: true,
      finishedAt: true,
      createdAt: true,
      updatedAt: true
    }
  });
}

export async function getAiStudyProjectProgress(ownerId: string, projectId: string) {
  await assertOwnedProject(ownerId, projectId);
  return getAiStudyProjectGenerationProgress(projectId);
}

export async function retryAiStudyProjectGeneration(ownerId: string, projectId: string) {
  const project = await prisma.aiStudyProject.findFirst({
    where: {
      id: projectId,
      ownerId,
      deletedAt: null
    },
    include: {
      tasks: {
        where: {
          status: "failed",
          type: { in: ["parse_source", "generate_outline", "generate_cards"] }
        },
        orderBy: { createdAt: "desc" },
        take: 1
      }
    }
  });

  if (!project) {
    throw new AiStudyError("学习项目不存在。", 404, "AI_STUDY_PROJECT_NOT_FOUND");
  }
  if (project.status !== "failed") {
    throw new AiStudyError("只有生成失败的项目可以重新解析。", 400, "AI_STUDY_PROJECT_NOT_FAILED");
  }

  const failedTask = project.tasks[0];
  if (!failedTask) {
    throw new AiStudyError("没有找到可重试的失败任务。", 400, "AI_STUDY_RETRY_TASK_NOT_FOUND");
  }
  if (failedTask.retryCount >= MAX_AI_STUDY_RETRY_COUNT) {
    throw new AiStudyError("无法解析此文档，请删除。", 400, "AI_STUDY_RETRY_LIMIT_REACHED");
  }

  const retriedTask = await prisma.$transaction(async (tx) => {
    if (failedTask.sourceId) {
      await tx.aiStudySource.updateMany({
        where: { id: failedTask.sourceId },
        data: { status: getRetrySourceStatus(failedTask.type) }
      });
    }

    const task = await tx.aiStudyGenerationTask.update({
      where: { id: failedTask.id },
      data: {
        status: "pending",
        stage: getRetryTaskStage(failedTask.type),
        errorMessage: null,
        retryCount: { increment: 1 },
        startedAt: null,
        finishedAt: null
      }
    });

    await tx.aiStudyProject.update({
      where: { id: project.id },
      data: { status: "processing" }
    });

    return task;
  });

  await enqueueAiStudyTask(retriedTask);
  await refreshAiStudyProgressCache(project.id);
  return { task: retriedTask };
}

export async function listAiStudyProjectNodes(ownerId: string, projectId: string) {
  return prisma.aiStudyNode.findMany({
    where: {
      projectId,
      project: accessibleProjectRelationWhere(ownerId)
    },
    orderBy: [{ depth: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      parentId: true,
      title: true,
      summary: true,
      sortOrder: true,
      depth: true,
      sourceChunkIds: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      cards: {
        select: {
          id: true,
          reviewStatus: true,
          updatedAt: true
        }
      },
      progress: {
        where: { userId: ownerId },
        select: {
          status: true,
          lastStudiedAt: true,
          masteredAt: true,
          updatedAt: true
        }
      }
    }
  });
}

export async function getAiStudyNodeDetail(ownerId: string, nodeId: string) {
  const node = await prisma.aiStudyNode.findFirst({
    where: {
      id: nodeId,
      project: accessibleProjectRelationWhere(ownerId)
    },
    include: {
      project: {
        select: {
          id: true,
          title: true,
          status: true,
          knowledgeCount: true,
          masteredCount: true
        }
      },
      cards: {
        take: 1,
        select: {
          id: true,
          overview: true,
          explanation: true,
          keyPoints: true,
          pitfalls: true,
          examples: true,
          flashcards: true,
          modelName: true,
          promptVersion: true,
          reviewStatus: true,
          createdAt: true,
          updatedAt: true
        }
      },
      progress: {
        where: { userId: ownerId },
        take: 1,
        select: {
          status: true,
          lastStudiedAt: true,
          masteredAt: true,
          updatedAt: true
        }
      }
    }
  });

  if (!node) {
    throw new AiStudyError("知识节点不存在。", 404, "AI_STUDY_NODE_NOT_FOUND");
  }

  const sourceChunkIds = Array.isArray(node.sourceChunkIds) ? node.sourceChunkIds.filter((value): value is string => typeof value === "string") : [];
  const sourceChunks = sourceChunkIds.length
    ? await prisma.aiStudySourceChunk.findMany({
        where: { id: { in: sourceChunkIds } },
        orderBy: [{ sourceId: "asc" }, { chunkIndex: "asc" }],
        select: {
          id: true,
          sourceId: true,
          pageNumber: true,
          chunkIndex: true,
          content: true,
          bbox: true,
          createdAt: true
        }
      })
    : [];

  const { cards, progress, ...nodeDetail } = node;
  return {
    ...nodeDetail,
    card: cards[0] || null,
    progress: progress[0] || null,
    sourceChunks
  };
}

type AiStudyBuddyChatInput = z.infer<typeof aiStudyBuddyChatSchema>;

type AiStudyBuddyProjectContext = {
  title: string;
  description: string | null;
  status: string;
  knowledgeCount: number;
  masteredCount: number;
};

type AiStudyBuddyCardContext = {
  overview: string;
  explanation: string;
  keyPoints: unknown;
  pitfalls: unknown;
  examples: unknown;
  flashcards: unknown;
};

type AiStudyBuddyNodeContext = {
  title: string;
  summary: string;
  depth: number;
  sourceChunkIds: unknown;
  cards: AiStudyBuddyCardContext[];
};

type AiStudyBuddyOutlineNode = {
  title: string;
  summary: string;
  depth: number;
  sortOrder: number;
};

type AiStudyBuddySourceChunkContext = {
  pageNumber: number | null;
  chunkIndex: number;
  content: string;
};

type AiStudyChatMessageRole = z.infer<typeof aiStudyChatMessageRoleSchema>;

type AiStudyChatMessageRow = {
  id: string;
  role: string;
  content: string;
  created_at: Date;
};

export type AiStudyChatMessage = {
  id: string;
  role: AiStudyChatMessageRole;
  content: string;
  createdAt: string;
};

export async function askAiStudyBuddy(ownerId: string, projectId: string, input: unknown) {
  const context = await prepareAiStudyBuddyChat(ownerId, projectId, input);
  const answer = await askQwen(context.messages, {
    temperature: 0.35,
    timeoutMs: 60_000
  });

  return {
    answer: sanitizeAiStudyBuddyAnswer(answer),
    nodeTitle: context.nodeTitle
  };
}

export async function streamAiStudyBuddy(
  ownerId: string,
  projectId: string,
  input: unknown,
  onChunk: (chunk: string) => void | Promise<void>,
  options: { signal?: AbortSignal } = {}
) {
  const context = await prepareAiStudyBuddyChat(ownerId, projectId, input);
  const answer = await streamQwen(context.messages, onChunk, {
    signal: options.signal,
    temperature: 0.35,
    timeoutMs: 60_000
  });

  return {
    answer: sanitizeAiStudyBuddyAnswer(answer),
    nodeTitle: context.nodeTitle
  };
}

export async function listAiStudyChatMessages(ownerId: string, projectId: string, nodeId?: string | null) {
  const normalizedNodeId = normalizeAiStudyChatNodeId(nodeId);
  await assertAiStudyChatContext(ownerId, projectId, normalizedNodeId);

  const limit = 80;
  const rows = await prisma.$queryRaw<AiStudyChatMessageRow[]>`
    SELECT "id", "role", "content", "created_at"
    FROM (
      SELECT "id", "role", "content", "created_at"
      FROM "ai_study_chat_messages"
      WHERE "user_id" = ${ownerId}
        AND "project_id" = ${projectId}
        AND (("node_id" = ${normalizedNodeId}) OR ("node_id" IS NULL AND ${normalizedNodeId} IS NULL))
      ORDER BY "created_at" DESC, "id" DESC
      LIMIT ${limit}
    ) AS recent_messages
    ORDER BY "created_at" ASC, "id" ASC
  `;

  return rows.map(mapAiStudyChatMessageRow);
}

export async function createAiStudyChatMessage(
  ownerId: string,
  projectId: string,
  nodeId: string | null | undefined,
  role: AiStudyChatMessageRole,
  content: string
) {
  const normalizedRole = aiStudyChatMessageRoleSchema.parse(role);
  const normalizedNodeId = normalizeAiStudyChatNodeId(nodeId);
  const normalizedContent = content.replace(/\r\n/g, "\n").trim();
  if (!normalizedContent) {
    throw new AiStudyError("对话内容不能为空。", 400, "AI_STUDY_CHAT_MESSAGE_EMPTY");
  }

  await assertAiStudyChatContext(ownerId, projectId, normalizedNodeId);

  const id = randomUUID();
  const rows = await prisma.$queryRaw<AiStudyChatMessageRow[]>`
    INSERT INTO "ai_study_chat_messages" ("id", "user_id", "project_id", "node_id", "role", "content")
    VALUES (${id}, ${ownerId}, ${projectId}, ${normalizedNodeId}, ${normalizedRole}, ${normalizedContent.slice(0, 20_000)})
    RETURNING "id", "role", "content", "created_at"
  `;

  const message = rows[0];
  if (!message) {
    throw new AiStudyError("对话记录保存失败。", 500, "AI_STUDY_CHAT_MESSAGE_SAVE_FAILED");
  }

  return mapAiStudyChatMessageRow(message);
}

export async function createPaidAiStudyChatUserMessage(
  ownerId: string,
  projectId: string,
  nodeId: string | null | undefined,
  content: string
) {
  const normalizedNodeId = normalizeAiStudyChatNodeId(nodeId);
  const normalizedContent = content.replace(/\r\n/g, "\n").trim();
  if (!normalizedContent) {
    throw new AiStudyError("对话内容不能为空。", 400, "AI_STUDY_CHAT_MESSAGE_EMPTY");
  }

  const id = randomUUID();
  try {
    return await prisma.$transaction(async (tx) => {
      const project = await tx.aiStudyProject.findFirst({
        where: accessibleProjectWhere(ownerId, projectId),
        select: { id: true }
      });
      if (!project) {
        throw new AiStudyError("学习项目不存在。", 404, "AI_STUDY_PROJECT_NOT_FOUND");
      }

      if (normalizedNodeId) {
        const node = await tx.aiStudyNode.findFirst({
          where: {
            id: normalizedNodeId,
            projectId,
            project: accessibleProjectRelationWhere(ownerId)
          },
          select: { id: true }
        });
        if (!node) {
          throw new AiStudyError("知识节点不存在。", 404, "AI_STUDY_NODE_NOT_FOUND");
        }
      }

      await consumeDiamondsByRule(tx, {
        userId: ownerId,
        ruleKey: "ai_study_buddy_chat",
        dedupeKey: `ai_study_buddy_chat:${id}`,
        note: "学习搭子：问问搭子",
        metadata: {
          projectId,
          chatMessageId: id,
          messageLength: normalizedContent.length,
          ...(normalizedNodeId ? { nodeId: normalizedNodeId } : {})
        }
      });

      const rows = await tx.$queryRaw<AiStudyChatMessageRow[]>`
        INSERT INTO "ai_study_chat_messages" ("id", "user_id", "project_id", "node_id", "role", "content")
        VALUES (${id}, ${ownerId}, ${projectId}, ${normalizedNodeId}, 'user', ${normalizedContent.slice(0, 20_000)})
        RETURNING "id", "role", "content", "created_at"
      `;

      const message = rows[0];
      if (!message) {
        throw new AiStudyError("对话记录保存失败。", 500, "AI_STUDY_CHAT_MESSAGE_SAVE_FAILED");
      }

      return mapAiStudyChatMessageRow(message);
    });
  } catch (error) {
    rethrowAiStudyDiamondError(error);
  }
}

async function prepareAiStudyBuddyChat(ownerId: string, projectId: string, input: unknown) {
  const parsed = parseAiStudyInput(aiStudyBuddyChatSchema, input, "对话参数不合法。");
  const project = await prisma.aiStudyProject.findFirst({
    where: accessibleProjectWhere(ownerId, projectId),
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      knowledgeCount: true,
      masteredCount: true
    }
  });

  if (!project) {
    throw new AiStudyError("学习项目不存在。", 404, "AI_STUDY_PROJECT_NOT_FOUND");
  }

  const node = parsed.nodeId
    ? await prisma.aiStudyNode.findFirst({
        where: {
          id: parsed.nodeId,
          projectId: project.id,
          project: accessibleProjectRelationWhere(ownerId)
        },
        select: {
          title: true,
          summary: true,
          depth: true,
          sourceChunkIds: true,
          cards: {
            take: 1,
            select: {
              overview: true,
              explanation: true,
              keyPoints: true,
              pitfalls: true,
              examples: true,
              flashcards: true
            }
          }
        }
      })
    : null;

  if (parsed.nodeId && !node) {
    throw new AiStudyError("知识节点不存在。", 404, "AI_STUDY_NODE_NOT_FOUND");
  }

  const [projectNodes, sourceChunks] = await Promise.all([
    prisma.aiStudyNode.findMany({
      where: { projectId: project.id },
      orderBy: [{ depth: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      take: 60,
      select: {
        title: true,
        summary: true,
        depth: true,
        sortOrder: true
      }
    }),
    listAiStudyBuddySourceChunks(project.id, extractSourceChunkIds(node?.sourceChunkIds))
  ]);

  const promptConfig = await getAiStudyPromptConfig();
  return {
    messages: buildAiStudyBuddyMessages({
      message: parsed.message,
      node,
      project,
      projectNodes,
      sourceChunks
    }, promptConfig),
    nodeTitle: node?.title || null
  };
}

function buildAiStudyBuddyMessages({
  message,
  node,
  project,
  projectNodes,
  sourceChunks
}: {
  message: AiStudyBuddyChatInput["message"];
  node: AiStudyBuddyNodeContext | null;
  project: AiStudyBuddyProjectContext;
  projectNodes: AiStudyBuddyOutlineNode[];
  sourceChunks: AiStudyBuddySourceChunkContext[];
}, promptConfig: AiStudyPromptConfig): ChatMessage[] {
  const card = node?.cards[0] || null;
  const context = [
    `项目：${project.title}`,
    project.description ? `项目说明：${truncateAiStudyBuddyText(project.description, 240)}` : "",
    `项目进度：${project.masteredCount}/${project.knowledgeCount} 已掌握知识点，项目状态：${project.status}`,
    node ? `当前知识点：${node.title}` : "",
    node?.summary ? `知识点摘要：${truncateAiStudyBuddyText(node.summary, 600)}` : "",
    card?.overview ? `卡片概述：${truncateAiStudyBuddyText(card.overview, 900)}` : "",
    card?.explanation ? `AI详解：${truncateAiStudyBuddyText(card.explanation, 1400)}` : "",
    buildAiStudyBuddyJsonSection("关键点", card?.keyPoints, 6),
    buildAiStudyBuddyJsonSection("易错点", card?.pitfalls, 4),
    buildAiStudyBuddyJsonSection("示例", card?.examples, 4),
    buildAiStudyBuddyOutline(projectNodes),
    buildAiStudyBuddySourceContext(sourceChunks),
    `学生问题：${message}`
  ].filter(Boolean).join("\n\n");

  return [
    {
      role: "system",
      content: promptConfig.render("chat.system")
    },
    {
      role: "user",
      content: promptConfig.render("chat.user", { context })
    }
  ];
}

async function listAiStudyBuddySourceChunks(projectId: string, sourceChunkIds: string[]) {
  if (sourceChunkIds.length > 0) {
    return prisma.aiStudySourceChunk.findMany({
      where: {
        id: { in: sourceChunkIds.slice(0, 8) },
        projectId
      },
      orderBy: [{ sourceId: "asc" }, { chunkIndex: "asc" }],
      take: 8,
      select: {
        pageNumber: true,
        chunkIndex: true,
        content: true
      }
    });
  }

  return prisma.aiStudySourceChunk.findMany({
    where: { projectId },
    orderBy: [{ sourceId: "asc" }, { chunkIndex: "asc" }],
    take: 4,
    select: {
      pageNumber: true,
      chunkIndex: true,
      content: true
    }
  });
}

function buildAiStudyBuddyOutline(nodes: AiStudyBuddyOutlineNode[]) {
  if (nodes.length === 0) {
    return "";
  }

  const lines = nodes.slice(0, 42).map((node) => {
    const indent = "  ".repeat(Math.min(Math.max(node.depth, 0), 3));
    const summary = node.summary ? `：${truncateAiStudyBuddyText(node.summary, 80)}` : "";
    return `${indent}- ${node.title}${summary}`;
  });
  return `项目大纲：\n${lines.join("\n")}`;
}

function buildAiStudyBuddySourceContext(sourceChunks: AiStudyBuddySourceChunkContext[]) {
  if (sourceChunks.length === 0) {
    return "";
  }

  const lines = sourceChunks.map((chunk) => {
    const pageText = chunk.pageNumber ? `第 ${chunk.pageNumber} 页` : `片段 ${chunk.chunkIndex + 1}`;
    return `${pageText}：${truncateAiStudyBuddyText(chunk.content, 520)}`;
  });
  return `资料原文片段：\n${lines.join("\n\n")}`;
}

function buildAiStudyBuddyJsonSection(label: string, value: unknown, maxItems: number) {
  const items = normalizeAiStudyBuddyJsonItems(value).slice(0, maxItems);
  if (items.length === 0) {
    return "";
  }
  return `${label}：\n${items.map((item, index) => `${index + 1}. ${truncateAiStudyBuddyText(item, 220)}`).join("\n")}`;
}

function normalizeAiStudyBuddyJsonItems(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }
      if (typeof item === "number" || typeof item === "boolean") {
        return String(item);
      }
      try {
        return JSON.stringify(item);
      } catch {
        return "";
      }
    })
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function extractSourceChunkIds(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function truncateAiStudyBuddyText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}...`;
}

function normalizeAiStudyChatNodeId(nodeId?: string | null) {
  const normalized = nodeId?.trim();
  return normalized ? normalized : null;
}

async function assertAiStudyChatContext(ownerId: string, projectId: string, nodeId: string | null) {
  await assertAccessibleProject(ownerId, projectId);
  if (!nodeId) {
    return;
  }

  const node = await prisma.aiStudyNode.findFirst({
    where: {
      id: nodeId,
      projectId,
      project: accessibleProjectRelationWhere(ownerId)
    },
    select: { id: true }
  });

  if (!node) {
    throw new AiStudyError("知识节点不存在。", 404, "AI_STUDY_NODE_NOT_FOUND");
  }
}

function mapAiStudyChatMessageRow(row: AiStudyChatMessageRow): AiStudyChatMessage {
  const role = row.role === "assistant" ? "assistant" : "user";
  const createdAt = row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString();
  return {
    id: row.id,
    role,
    content: row.content,
    createdAt
  };
}

export function sanitizeAiStudyBuddyAnswer(value: string) {
  return value
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```[a-zA-Z0-9_-]*\n?/g, "").replace(/```/g, ""))
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "· ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function updateAiStudyNode(ownerId: string, nodeId: string, input: unknown) {
  const parsed = parseAiStudyInput(updateNodeSchema, input, "知识节点参数不合法。");
  const result = await prisma.aiStudyNode.updateMany({
    where: {
      id: nodeId,
      project: {
        ownerId,
        deletedAt: null
      }
    },
    data: {
      title: parsed.title
    }
  });

  if (result.count === 0) {
    throw new AiStudyError("知识节点不存在。", 404, "AI_STUDY_NODE_NOT_FOUND");
  }

  return getAiStudyNodeDetail(ownerId, nodeId);
}

export async function updateAiStudyNodeProgress(ownerId: string, nodeId: string, input: unknown) {
  const parsed = parseAiStudyInput(updateProgressSchema, input, "掌握状态参数不合法。");
  const node = await prisma.aiStudyNode.findFirst({
    where: {
      id: nodeId,
      project: {
        ownerId,
        deletedAt: null
      }
    },
    select: {
      id: true,
      projectId: true
    }
  });

  if (!node) {
    throw new AiStudyError("知识节点不存在。", 404, "AI_STUDY_NODE_NOT_FOUND");
  }

  const now = new Date();
  const progress = await prisma.$transaction(async (tx) => {
    const saved = await tx.aiStudyProgress.upsert({
      where: {
        userId_nodeId: {
          userId: ownerId,
          nodeId: node.id
        }
      },
      create: {
        userId: ownerId,
        projectId: node.projectId,
        nodeId: node.id,
        status: parsed.status,
        lastStudiedAt: now,
        masteredAt: parsed.status === "mastered" ? now : null
      },
      update: {
        status: parsed.status,
        lastStudiedAt: now,
        masteredAt: parsed.status === "mastered" ? now : null
      }
    });

    const masteredCount = await tx.aiStudyProgress.count({
      where: {
        projectId: node.projectId,
        status: "mastered"
      }
    });

    await tx.aiStudyProject.update({
      where: { id: node.projectId },
      data: {
        masteredCount,
        lastStudiedAt: now
      }
    });

    return saved;
  });

  return progress;
}

export async function markAiStudyTaskRunning(taskId: string, stage: string) {
  return updateAiStudyTaskStatus(taskId, "running", {
    stage,
    startedAt: new Date(),
    finishedAt: null,
    errorMessage: null
  });
}

export async function markAiStudyTaskSucceeded(taskId: string, outputSummary: Record<string, unknown> = {}) {
  return updateAiStudyTaskStatus(taskId, "succeeded", {
    outputSummary,
    finishedAt: new Date(),
    errorMessage: null
  });
}

export async function markAiStudyTaskFailed(taskId: string, errorMessage: string, stage?: string) {
  return updateAiStudyTaskStatus(taskId, "failed", {
    ...(stage ? { stage } : {}),
    errorMessage: errorMessage.slice(0, 4000),
    finishedAt: new Date()
  });
}

async function updateAiStudyTaskStatus(taskId: string, status: AiStudyTaskStatus, data: Record<string, unknown>) {
  return prisma.aiStudyGenerationTask.update({
    where: { id: taskId },
    data: {
      ...data,
      status
    } as never
  });
}

function parseAiStudyInput<T>(schema: z.ZodType<T>, input: unknown, message: string) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new AiStudyError(message, 400, "AI_STUDY_INVALID_INPUT");
  }
  return parsed.data;
}

async function assertProjectCreateLimit(ownerId: string) {
  const maxProjectsPerDay = getNumberEnv("AI_STUDY_MAX_PROJECTS_PER_DAY", 3);
  if (maxProjectsPerDay <= 0) {
    return;
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const count = await prisma.aiStudyProject.count({
    where: {
      ownerId,
      createdAt: { gte: since }
    }
  });

  if (count >= maxProjectsPerDay) {
    throw new AiStudyError("今天创建的学习项目已达上限，请明天再试。", 429, "AI_STUDY_PROJECT_LIMIT_REACHED");
  }
}

async function assertCourseExists(courseId: string | null) {
  if (!courseId) {
    return;
  }
  const course = await prisma.learningCourse.findUnique({
    where: { id: courseId },
    select: { id: true }
  });
  if (!course) {
    throw new AiStudyError("关联课程不存在。", 400, "AI_STUDY_COURSE_NOT_FOUND");
  }
}

async function assertOwnedProject(ownerId: string, projectId: string) {
  const project = await prisma.aiStudyProject.findFirst({
    where: {
      id: projectId,
      ownerId,
      deletedAt: null
    },
    select: {
      id: true,
      sourceType: true,
      status: true
    }
  });

  if (!project) {
    throw new AiStudyError("学习项目不存在。", 404, "AI_STUDY_PROJECT_NOT_FOUND");
  }

  return project;
}

async function assertAccessibleProject(ownerId: string, projectId: string) {
  const project = await prisma.aiStudyProject.findFirst({
    where: accessibleProjectWhere(ownerId, projectId),
    select: { id: true }
  });

  if (!project) {
    throw new AiStudyError("学习项目不存在。", 404, "AI_STUDY_PROJECT_NOT_FOUND");
  }

  return project;
}

function accessibleProjectWhere(ownerId: string, projectId: string) {
  return {
    id: projectId,
    deletedAt: null,
    OR: [
      { ownerId },
      publicReadyProjectWhere()
    ]
  };
}

function accessibleProjectRelationWhere(ownerId: string) {
  return {
    deletedAt: null,
    OR: [
      { ownerId },
      publicReadyProjectWhere()
    ]
  };
}

function publicReadyProjectWhere() {
  return {
    visibility: "public" as const,
    status: "ready" as const
  };
}

export function buildAiStudyTextChunks(text: string) {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!normalized) {
    return [];
  }

  const maxChunkLength = 1200;
  const paragraphs = normalized.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChunkLength) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      for (let index = 0; index < paragraph.length; index += maxChunkLength) {
        chunks.push(paragraph.slice(index, index + maxChunkLength));
      }
      continue;
    }

    const next = current ? `${current}\n\n${paragraph}` : paragraph;
    if (next.length > maxChunkLength) {
      chunks.push(current);
      current = paragraph;
    } else {
      current = next;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

function getSupportedUploadSource(fileName: string, mimeType: string): { sourceType: UploadableSourceType; mimeType: string; defaultFileName: string } | null {
  const normalizedMimeType = mimeType.toLowerCase();
  const normalizedFileName = fileName.toLowerCase();
  if (normalizedMimeType === "application/pdf" || normalizedFileName.endsWith(".pdf")) {
    return {
      sourceType: "pdf",
      mimeType: normalizedMimeType || "application/pdf",
      defaultFileName: "source.pdf"
    };
  }
  if (
    normalizedMimeType === "application/msword" ||
    normalizedMimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    normalizedFileName.endsWith(".doc") ||
    normalizedFileName.endsWith(".docx")
  ) {
    const isLegacyDoc = normalizedFileName.endsWith(".doc");
    return {
      sourceType: "document",
      mimeType: normalizedMimeType || (isLegacyDoc ? "application/msword" : getDefaultMimeTypeForSourceType("document")),
      defaultFileName: isLegacyDoc ? "source.doc" : "source.docx"
    };
  }
  return null;
}

function getDefaultMimeTypeForSourceType(sourceType: string) {
  if (sourceType === "pdf") {
    return "application/pdf";
  }
  if (sourceType === "document") {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  return "application/octet-stream";
}

function mergeUploadedSourceType(currentSourceType: string, uploadedSourceType: UploadableSourceType) {
  if (currentSourceType === uploadedSourceType) {
    return uploadedSourceType;
  }
  return "mixed";
}

function sanitizeFileName(fileName: string) {
  const fallback = fileName.split(/[\\/]/).pop() || "source.pdf";
  const safe = fallback
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return safe.slice(0, 120);
}

function getRetryTaskStage(type: AiStudyGenerationTask["type"]) {
  if (type === "parse_source") {
    return "waiting_for_source_parse";
  }
  if (type === "generate_outline") {
    return "waiting_for_ai_generation";
  }
  return "waiting_for_card_generation";
}

function getRetrySourceStatus(type: AiStudyGenerationTask["type"]) {
  if (type === "parse_source") {
    return "uploaded";
  }
  return "parsed";
}

function getMaxFileBytes() {
  return getNumberEnv("AI_STUDY_MAX_FILE_MB", 20) * 1024 * 1024;
}

function getNumberEnv(name: string, defaultValue: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : defaultValue;
}
