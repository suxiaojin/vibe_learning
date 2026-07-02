import type { AiStudyGenerationTask, AiStudyTaskType } from "@prisma/client";
import { getRedisClient, isRedisConfigured } from "@/lib/redis";

export const aiStudyQueueTaskTypes = ["parse_source", "generate_outline", "generate_cards"] as const;

type QueueableAiStudyTask = Pick<AiStudyGenerationTask, "id" | "projectId" | "sourceId" | "type">;

export type AiStudyQueuedTaskEntry = {
  entryId: string;
  taskId: string;
  type?: string;
  projectId?: string;
  sourceId?: string | null;
};

const streamKey = process.env.AI_STUDY_QUEUE_STREAM || "ai-study:generation:tasks";
const groupName = process.env.AI_STUDY_QUEUE_GROUP || "ai-study-workers";
const defaultConsumerName = `ai-study-worker-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
let queueGroupReady = false;
let queueGroupPromise: Promise<void> | null = null;

export function isAiStudyTaskQueueConfigured() {
  return isRedisConfigured();
}

export function getAiStudyTaskQueueSettings() {
  return {
    configured: isAiStudyTaskQueueConfigured(),
    streamKey,
    groupName,
    consumerName: getConsumerName(),
    blockMs: getNumberEnv("AI_STUDY_QUEUE_BLOCK_MS", 5000),
    fallbackScanMs: getNumberEnv("AI_STUDY_QUEUE_FALLBACK_SCAN_MS", 60_000),
    pendingIdleMs: getNumberEnv("AI_STUDY_QUEUE_PENDING_IDLE_MS", 600_000)
  };
}

export function isSupportedAiStudyTaskType(type: string): type is AiStudyTaskType {
  return aiStudyQueueTaskTypes.includes(type as (typeof aiStudyQueueTaskTypes)[number]);
}

export async function enqueueAiStudyTask(task: QueueableAiStudyTask | null | undefined) {
  if (!task || !isSupportedAiStudyTaskType(task.type)) {
    return false;
  }

  const redis = getRedisClient();
  if (!redis) {
    return false;
  }

  try {
    await redis.xadd(
      streamKey,
      "MAXLEN",
      "~",
      String(getNumberEnv("AI_STUDY_QUEUE_MAXLEN", 10_000)),
      "*",
      "taskId",
      task.id,
      "type",
      task.type,
      "projectId",
      task.projectId,
      "sourceId",
      task.sourceId || ""
    );
    return true;
  } catch (error) {
    console.warn(`AI study task Redis enqueue failed for task=${task.id}`, error);
    return false;
  }
}

export async function readAiStudyQueuedTaskEntries(count: number) {
  const redis = getRedisClient();
  if (!redis) {
    return [];
  }

  try {
    await ensureAiStudyTaskQueueGroup();
    const result = await redis.xreadgroup(
      "GROUP",
      groupName,
      getConsumerName(),
      "COUNT",
      String(Math.max(1, count)),
      "BLOCK",
      String(getNumberEnv("AI_STUDY_QUEUE_BLOCK_MS", 5000)),
      "STREAMS",
      streamKey,
      ">"
    );
    return parseStreamReadResult(result);
  } catch (error) {
    console.warn("AI study task Redis read failed", error);
    return [];
  }
}

export async function claimStaleAiStudyQueuedTaskEntries(count: number) {
  const redis = getRedisClient();
  if (!redis) {
    return [];
  }

  try {
    await ensureAiStudyTaskQueueGroup();
    const result = await redis.xautoclaim(
      streamKey,
      groupName,
      getConsumerName(),
      getNumberEnv("AI_STUDY_QUEUE_PENDING_IDLE_MS", 600_000),
      "0-0",
      "COUNT",
      String(Math.max(1, count))
    );
    return parseStreamEntries(Array.isArray(result) ? result[1] : []);
  } catch (error) {
    console.warn("AI study task Redis stale claim failed", error);
    return [];
  }
}

export async function ackAiStudyQueuedTask(entryId: string) {
  const redis = getRedisClient();
  if (!redis) {
    return false;
  }

  try {
    await redis.xack(streamKey, groupName, entryId);
    return true;
  } catch (error) {
    console.warn(`AI study task Redis ack failed for entry=${entryId}`, error);
    return false;
  }
}

async function ensureAiStudyTaskQueueGroup() {
  if (queueGroupReady) {
    return;
  }
  if (queueGroupPromise) {
    await queueGroupPromise;
    return;
  }

  queueGroupPromise = createAiStudyTaskQueueGroup();
  try {
    await queueGroupPromise;
    queueGroupReady = true;
  } finally {
    queueGroupPromise = null;
  }
}

async function createAiStudyTaskQueueGroup() {
  const redis = getRedisClient();
  if (!redis) {
    return;
  }

  try {
    await redis.xgroup("CREATE", streamKey, groupName, "0", "MKSTREAM");
  } catch (error) {
    if (error instanceof Error && error.message.includes("BUSYGROUP")) {
      return;
    }
    throw error;
  }
}

function parseStreamReadResult(result: unknown) {
  if (!Array.isArray(result)) {
    return [];
  }

  const entries: unknown[] = [];
  for (const stream of result) {
    if (Array.isArray(stream) && stream[0] === streamKey && Array.isArray(stream[1])) {
      entries.push(...stream[1]);
    }
  }
  return parseStreamEntries(entries);
}

function parseStreamEntries(entries: unknown) {
  if (!Array.isArray(entries)) {
    return [];
  }

  const parsed: AiStudyQueuedTaskEntry[] = [];
  for (const entry of entries) {
    if (!Array.isArray(entry) || typeof entry[0] !== "string" || !Array.isArray(entry[1])) {
      continue;
    }

    const fields = fieldsToRecord(entry[1]);
    if (!fields.taskId) {
      continue;
    }

    parsed.push({
      entryId: entry[0],
      taskId: fields.taskId,
      type: fields.type,
      projectId: fields.projectId,
      sourceId: fields.sourceId || null
    });
  }

  return parsed;
}

function fieldsToRecord(fields: unknown[]) {
  const result: Record<string, string> = {};
  for (let index = 0; index < fields.length; index += 2) {
    const key = fields[index];
    const value = fields[index + 1];
    if (typeof key === "string") {
      result[key] = typeof value === "string" ? value : "";
    }
  }
  return result;
}

function getConsumerName() {
  return process.env.AI_STUDY_QUEUE_CONSUMER_NAME?.trim() || defaultConsumerName;
}

function getNumberEnv(name: string, defaultValue: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : defaultValue;
}
