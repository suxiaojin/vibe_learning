import crypto from "node:crypto";
import type { AiStudyOverviewJob } from "@prisma/client";
import { prisma } from "./prisma";
import { accessibleAiStudyProjectWhere } from "./study-project-access";
import { loadAiStudySourceChunksWithContent } from "./ai-study-source-content";
import { askQwenDetailed } from "./qwen";
import { getAiServerConfigsForModule, type ActiveAiServerConfig } from "./ai-server-settings";
import { buildOverviewGroups, overviewMessages, overviewSchema, parseOverview, selectOverviewSources } from "./ai-study-overview";
import { getAiStudyOverviewPromptConfig } from "./ai-study-overview-prompts";

const leaseMs = 180_000;
const maxAttempts = 2;
const capacity = 3;
const timeoutMs = Math.max(5_000, Math.min(120_000, Number(process.env.AI_STUDY_OVERVIEW_TIMEOUT_MS) || 90_000));

export class AiStudyOverviewRequestError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) { super(message); }
}

export async function getAiStudyOverviewStatus(viewerId: string, nodeId: string) {
  const node = await prisma.aiStudyNode.findFirst({
    where: { id: nodeId, depth: 1, project: accessibleAiStudyProjectWhere(viewerId) },
    select: {
      cards: { take: 1, select: { modelName: true } },
      overviewJob: { select: { status: true, attempts: true, errorMessage: true } }
    }
  });
  if (!node) throw new AiStudyOverviewRequestError("无权查看该二层节点。", 403, "FORBIDDEN");
  const generated = Boolean(node.cards[0] && node.cards[0].modelName !== "deterministic-directory");
  return {
    job: node.overviewJob ?? { status: generated ? "succeeded" : "unrequested", attempts: 0, errorMessage: null },
    generated
  };
}

export async function requestAiStudyOverview(viewerId: string, nodeId: string, retry: boolean) {
  const node = await prisma.aiStudyNode.findFirst({
    where: { id: nodeId, depth: 1, project: accessibleAiStudyProjectWhere(viewerId) },
    select: { projectId: true, cards: { take: 1, select: { modelName: true } } }
  });
  if (!node) throw new AiStudyOverviewRequestError("无权操作该二层节点。", 403, "FORBIDDEN");
  const card = node.cards[0];
  if (!card) throw new AiStudyOverviewRequestError("二层目录卡片尚未准备好。", 409, "OVERVIEW_NOT_READY");
  if (card.modelName !== "deterministic-directory") return { status: "succeeded" };

  if (retry) {
    const reset = await prisma.aiStudyOverviewJob.updateMany({
      where: { nodeId, status: "failed" },
      data: { status: "pending", attempts: 0, priority: 100, errorMessage: null, nextAttemptAt: new Date() }
    });
    if (!reset.count && !await prisma.aiStudyOverviewJob.findUnique({ where: { nodeId }, select: { id: true } })) {
      throw new AiStudyOverviewRequestError("该节点尚无可重试的概述任务。", 409, "OVERVIEW_JOB_NOT_FOUND");
    }
  } else {
    await prisma.aiStudyOverviewJob.upsert({
      where: { nodeId },
      create: { nodeId, projectId: node.projectId, priority: 100 },
      update: { priority: 100 }
    });
  }
  return prisma.aiStudyOverviewJob.findUniqueOrThrow({ where: { nodeId }, select: { status: true, attempts: true, errorMessage: true } });
}

export async function runAiStudyOverviewJobCycle() {
  const now = new Date();
  const availableWork = await prisma.aiStudyOverviewJob.count({
    where: { OR: [
      { status: "pending", nextAttemptAt: { lte: now } },
      { status: "running", leaseExpiresAt: { lt: now } }
    ] }
  });
  if (!availableWork) return false;
  const serverConfigs = await getAiServerConfigsForModule("ai_study_overview");
  const claimed = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(71883012)`;
    const now = new Date();
    await tx.aiStudyOverviewJob.updateMany({
      where: { status: "running", leaseExpiresAt: { lt: now }, attempts: { lt: maxAttempts } },
      data: { status: "pending", leaseToken: null, leaseExpiresAt: null, nextAttemptAt: now, errorMessage: "任务租约过期，正在重试。" }
    });
    await tx.aiStudyOverviewJob.updateMany({
      where: { status: "running", leaseExpiresAt: { lt: now }, attempts: { gte: maxAttempts } },
      data: { status: "failed", leaseToken: null, leaseExpiresAt: null, errorMessage: "任务进程中断，请重试。" }
    });
    const running = await tx.aiStudyOverviewJob.findMany({
      where: { status: "running", leaseExpiresAt: { gte: now } },
      select: { assignedAiServerId: true }
    });
    if (running.length >= Math.min(capacity, serverConfigs.length)) return null;
    // A job claimed by the previous worker version has no assignment; let it finish first.
    if (running.some((item) => !item.assignedAiServerId)) return null;
    const occupied = new Set(running.map((item) => item.assignedAiServerId));
    const serverConfig = serverConfigs.find((config) => !occupied.has(config.id));
    if (!serverConfig) return null;
    const pending = await tx.aiStudyOverviewJob.findFirst({
      where: { status: "pending", nextAttemptAt: { lte: now }, project: { deletedAt: null, status: { not: "archived" } } },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }, { id: "asc" }]
    });
    if (!pending) return null;
    const job = await tx.aiStudyOverviewJob.update({
      where: { id: pending.id },
      data: {
        status: "running", attempts: { increment: 1 }, leaseToken: crypto.randomUUID(),
        leaseExpiresAt: new Date(Date.now() + leaseMs), errorMessage: null,
        assignedAiServerId: serverConfig.id, assignedAiModel: serverConfig.model
      }
    });
    return { job, serverConfig };
  });
  if (!claimed) return false;
  await runOverviewJob(claimed.job, claimed.serverConfig);
  return true;
}

async function runOverviewJob(job: AiStudyOverviewJob, serverConfig: ActiveAiServerConfig) {
  let heartbeatFailed = false;
  let heartbeatPromise: Promise<unknown> | undefined;
  const timer = setInterval(() => {
    if (heartbeatPromise) return;
    heartbeatPromise = prisma.aiStudyOverviewJob.updateMany({
      where: { id: job.id, status: "running", leaseToken: job.leaseToken, leaseExpiresAt: { gt: new Date() } },
      data: { leaseExpiresAt: new Date(Date.now() + leaseMs) }
    }).then((result) => { if (!result.count) heartbeatFailed = true; })
      .catch(() => { heartbeatFailed = true; })
      .finally(() => { heartbeatPromise = undefined; });
  }, 30_000);

  try {
    const project = await prisma.aiStudyProject.findFirstOrThrow({
      where: { id: job.projectId, deletedAt: null }, select: { title: true }
    });
    const node = await prisma.aiStudyNode.findFirstOrThrow({
      where: { id: job.nodeId, projectId: job.projectId, depth: 1 },
      select: { id: true, parentId: true, title: true, depth: true, sourceChunkIds: true }
    });
    const descendants = await prisma.aiStudyNode.findMany({
      where: { projectId: job.projectId, depth: { in: [2, 3] } },
      orderBy: [{ depth: "asc" }, { sortOrder: "asc" }],
      select: { id: true, parentId: true, title: true, depth: true, sourceChunkIds: true }
    });
    const selected = selectOverviewSources(node, descendants);
    const sources = await loadAiStudySourceChunksWithContent(job.projectId, { ids: selected.sourceIds });
    const groups = buildOverviewGroups(selected, sources);
    const prompt = await getAiStudyOverviewPromptConfig();
    const response = await askQwenDetailed(overviewMessages(project.title, node.title, groups, prompt.templates), {
      serverConfig, temperature: 0.2, timeoutMs, maxCompletionTokens: 600,
      enableThinking: false, jsonSchema: { name: "study_module_overview", schema: overviewSchema }
    });
    if (response.finishReason === "length") throw new Error("内容概述输出被截断。");
    const overview = parseOverview(response.content, groups);
    if (heartbeatFailed) throw new Error("概述任务租约已失效。");
    await prisma.$transaction(async (tx) => {
      const owned = await tx.aiStudyOverviewJob.updateMany({
        where: { id: job.id, status: "running", leaseToken: job.leaseToken, leaseExpiresAt: { gt: new Date() }, project: { deletedAt: null } },
        data: { status: "succeeded", leaseToken: null, leaseExpiresAt: null, errorMessage: null }
      });
      if (!owned.count) throw new Error("概述任务租约已移交。");
      const saved = await tx.aiStudyCard.updateMany({
        where: { nodeId: job.nodeId, projectId: job.projectId, modelName: "deterministic-directory" },
        data: { overview, modelName: response.serverConfig.model, promptVersion: prompt.sourceVersion, aiPromptVersionId: prompt.id }
      });
      if (!saved.count) throw new Error("二层目录卡片已更新或不存在。");
    });
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 1500);
    await prisma.aiStudyOverviewJob.updateMany({
      where: { id: job.id, status: "running", leaseToken: job.leaseToken },
      data: {
        status: job.attempts < maxAttempts ? "pending" : "failed",
        leaseToken: null, leaseExpiresAt: null,
        nextAttemptAt: new Date(Date.now() + 5_000 * job.attempts), errorMessage: message
      }
    });
  } finally {
    clearInterval(timer);
    await heartbeatPromise;
  }
}
