import { Prisma, type AiStudyGenerationTask } from "@prisma/client";
import { getAiServerConfigsForModule, type ActiveAiServerConfig } from "@/lib/ai-server-settings";
import { processClaimedAiStudyTask } from "@/lib/ai-study-generation";
import { chooseFairAiStudyTask } from "@/lib/ai-study-task-fairness";
import { prisma } from "@/lib/prisma";

export type AiStudyWorkerPool = "parse_source" | "generate_outline" | "generate_cards";

// The database lock makes these limits global across worker processes. Model
// requests and MinerU parsing run after the transaction has released it.
const poolLockId = 71883009;
const parseCapacity = 3;
const outlineCapacity = 3;

type ClaimedTask = {
  taskId: string;
  serverConfig?: ActiveAiServerConfig;
};

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function runAiStudyWorkerPoolCycle(pool: AiStudyWorkerPool): Promise<boolean> {
  // Avoid loading and decrypting server settings on idle outline polls.
  if (pool === "generate_outline" && !(await prisma.aiStudyGenerationTask.count({
    where: { type: pool, status: "pending" }
  }))) return false;

  const configs = pool === "generate_outline"
    ? await getAiServerConfigsForModule("ai_study_generation")
    : [];
  const claimed = await prisma.$transaction(async (tx): Promise<ClaimedTask | null> => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${poolLockId})`;

    if (pool === "parse_source") {
      const running = await tx.aiStudyGenerationTask.findMany({
        where: { type: pool, status: "running" },
        select: { project: { select: { ownerId: true } } }
      });
      if (running.length >= parseCapacity) return null;
      const pending = await tx.aiStudyGenerationTask.findMany({
        where: { type: pool, status: "pending" },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        include: { project: { select: { ownerId: true } } }
      });
      const lastClaims = await getLastClaimedAtByOwner(tx, pool, pending.map((item) => item.project.ownerId));
      const task = chooseFairAiStudyTask(pending, running.map((item) => item.project.ownerId), lastClaims);
      return task ? claimTask(tx, task) : null;
    }

    if (pool === "generate_cards") {
      // Scheduling is idempotent; recover a coordinator interrupted mid-write.
      await tx.aiStudyGenerationTask.updateMany({
        where: { type: pool, status: "running", stage: "scheduling_cards", updatedAt: { lt: new Date(Date.now() - 300_000) } },
        data: { status: "pending", stage: "scheduling_recovered" }
      });
      if (await tx.aiStudyGenerationTask.count({ where: { type: pool, status: "running" } }) >= 1) return null;
      const task = await tx.aiStudyGenerationTask.findFirst({
        where: { type: pool, status: "pending" },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }]
      });
      return task ? claimTask(tx, task) : null;
    }

    const running = await tx.aiStudyGenerationTask.findMany({
      where: { type: pool, status: "running" },
      select: { inputSummary: true, project: { select: { ownerId: true } } }
    });
    if (running.length >= Math.min(outlineCapacity, configs.length)) return null;
    const occupied = new Set(running.map((task) => jsonRecord(task.inputSummary).assignedAiServerId)
      .filter((id): id is string => typeof id === "string"));
    const freeConfigs = configs.filter((config) => !occupied.has(config.id));
    if (!freeConfigs.length) return null;

    const pending = await tx.aiStudyGenerationTask.findMany({
      where: { type: pool, status: "pending" },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: { project: { select: { ownerId: true } } }
    });
    const lastClaims = await getLastClaimedAtByOwner(tx, pool, pending.map((item) => item.project.ownerId));
    const assignmentFor = (task: (typeof pending)[number]) => {
      const input = jsonRecord(task.inputSummary);
      const pinnedId = typeof input.assignedAiServerId === "string" ? input.assignedAiServerId : null;
      const pinnedModel = typeof input.assignedAiModel === "string" ? input.assignedAiModel : null;
      const pinned = freeConfigs.find((config) => config.id === pinnedId && config.model === pinnedModel);
      if (pinnedId && !pinned && configs.some((config) => config.id === pinnedId && config.model === pinnedModel)) {
        // Its original server is busy; keep the assignment stable.
        return null;
      }
      return { input, serverConfig: pinned || freeConfigs[0], reassigned: Boolean(pinnedId && !pinned) };
    };
    const task = chooseFairAiStudyTask(
      pending,
      running.map((item) => item.project.ownerId),
      lastClaims,
      (candidate) => assignmentFor(candidate) !== null
    );
    if (!task) return null;
    const assignment = assignmentFor(task)!;
    return claimTask(tx, task, {
      serverConfig: assignment.serverConfig,
      inputSummary: {
        ...assignment.input,
        assignedAiServerId: assignment.serverConfig.id,
        assignedAiModel: assignment.serverConfig.model
      },
      // A checkpoint generated by another model must not be resumed with a
      // different model after an administrator changes the server route.
      outputSummary: assignment.reassigned
        ? { ...jsonRecord(task.outputSummary), curriculumCheckpoint: null }
        : undefined
    });
  });

  if (!claimed) return false;
  console.log(`AI study ${pool} task=${claimed.taskId}${claimed.serverConfig ? ` model=${claimed.serverConfig.model} server=${claimed.serverConfig.id}` : ""}`);
  await processClaimedAiStudyTask(claimed.taskId, claimed.serverConfig);
  return true;
}

async function getLastClaimedAtByOwner(
  tx: Prisma.TransactionClient,
  pool: AiStudyWorkerPool,
  ownerIds: string[]
): Promise<Map<string, number>> {
  const uniqueOwnerIds = [...new Set(ownerIds)];
  if (!uniqueOwnerIds.length) return new Map();
  const rows = await tx.$queryRaw<Array<{ ownerId: string; lastStartedAt: Date }>>`
    SELECT p."ownerId" AS "ownerId", MAX(t."startedAt") AS "lastStartedAt"
    FROM ai_study_generation_tasks t
    JOIN ai_study_projects p ON p.id = t."projectId"
    WHERE t.type::text = ${pool} AND t."startedAt" IS NOT NULL
      AND p."ownerId" IN (${Prisma.join(uniqueOwnerIds)})
    GROUP BY p."ownerId"
  `;
  return new Map(rows.map((row) => [row.ownerId, row.lastStartedAt.getTime()]));
}

async function claimTask(
  tx: Prisma.TransactionClient,
  task: AiStudyGenerationTask,
  options: {
    serverConfig?: ActiveAiServerConfig;
    inputSummary?: Record<string, unknown>;
    outputSummary?: Record<string, unknown>;
  } = {}
): Promise<ClaimedTask> {
  await tx.aiStudyGenerationTask.update({
    where: { id: task.id },
    data: {
      status: "running",
      stage: "claimed",
      startedAt: new Date(),
      finishedAt: null,
      errorMessage: null,
      ...(options.inputSummary ? { inputSummary: options.inputSummary as Prisma.InputJsonValue } : {}),
      ...(options.outputSummary ? { outputSummary: options.outputSummary as Prisma.InputJsonValue } : {})
    }
  });
  return { taskId: task.id, serverConfig: options.serverConfig };
}
