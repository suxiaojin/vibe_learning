import { runCardJobCycle } from "../src/lib/ai-study-card-jobs";
import { runAiStudyOverviewJobCycle } from "../src/lib/ai-study-overview-jobs";
import {
  runAiStudyWorkerPoolCycle,
  startAiStudyWorkerPoolTask,
  type AiStudyWorkerPool
} from "../src/lib/ai-study-worker-pools";
import { maxStudyMineruConcurrency } from "../src/lib/ai-study-mineru-settings";
import {
  ackAiStudyQueuedTask,
  claimStaleAiStudyQueuedTaskEntries,
  getAiStudyTaskQueueSettings,
  readAiStudyQueuedTaskEntries
} from "../src/lib/ai-study-task-queue";
import { prisma } from "../src/lib/prisma";
import { disconnectRedis } from "../src/lib/redis";

const pollIntervalMs = Math.max(250, Number(process.env.AI_STUDY_WORKER_INTERVAL_MS || 1000));
let stopping = false;

async function concurrentPoolLoop(pool: "parse_source" | "generate_outline", maxActive = Infinity) {
  const active = new Set<Promise<unknown>>();
  while (!stopping) {
    try {
      const task = active.size < maxActive
        ? await startAiStudyWorkerPoolTask(pool)
        : null;
      if (task) {
        const completion = task.completion
          .catch((error) => console.error(`AI study ${pool} task failed`, error))
          .finally(() => active.delete(completion));
        active.add(completion);
        continue;
      }
    } catch (error) {
      console.error(`AI study ${pool} scheduling failed`, error);
    }
    await sleep(pollIntervalMs);
  }
  await Promise.all(active);
}

async function poolLoop(pool: AiStudyWorkerPool, lane: number) {
  while (!stopping) {
    try {
      if (await runAiStudyWorkerPoolCycle(pool)) continue;
    } catch (error) {
      console.error(`AI study ${pool} lane=${lane} failed`, error);
    }
    await sleep(pollIntervalMs);
  }
}

async function cardLoop() {
  while (!stopping) {
    try {
      if (await runCardJobCycle()) continue;
    } catch (error) {
      console.error("AI study on-demand card pool failed", error);
    }
    await sleep(pollIntervalMs);
  }
}

async function overviewLoop(depth: 1 | 2, lane: number) {
  while (!stopping) {
    try {
      if (await runAiStudyOverviewJobCycle(depth)) continue;
    } catch (error) {
      console.error(`AI study overview depth=${depth} lane=${lane} failed`, error);
    }
    await sleep(pollIntervalMs);
  }
}

async function queueNotificationDrain() {
  if (!getAiStudyTaskQueueSettings().configured) return;
  // PostgreSQL is the durable work list and owns the per-pool capacity locks.
  // Redis entries are wake-up hints; ACK them to avoid stranded consumers.
  while (!stopping) {
    const entries = await readAiStudyQueuedTaskEntries(64);
    const stale = await claimStaleAiStudyQueuedTaskEntries(64);
    for (const entry of [...entries, ...stale]) await ackAiStudyQueuedTask(entry.entryId);
    if (!entries.length && !stale.length) await sleep(pollIntervalMs);
  }
}

async function main() {
  console.log("AI study worker started: MinerU and outline concurrency from admin settings, cards=on demand, level 2 and 3 overviews=3 lanes each with shared server occupancy");
  await Promise.all([
    // Both MinerU services can have in-flight tasks after a provider switch.
    concurrentPoolLoop("parse_source", 2 * maxStudyMineruConcurrency),
    concurrentPoolLoop("generate_outline"),
    poolLoop("generate_cards", 1),
    cardLoop(),
    ...Array.from({ length: 3 }, (_, index) => overviewLoop(1, index + 1)),
    ...Array.from({ length: 3 }, (_, index) => overviewLoop(2, index + 1)),
    queueNotificationDrain()
  ]);
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  console.log(`AI study worker received ${signal}; waiting for active tasks to finish.`);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

main()
  .catch((error) => {
    console.error("AI study worker stopped unexpectedly", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await disconnectRedis();
  });
