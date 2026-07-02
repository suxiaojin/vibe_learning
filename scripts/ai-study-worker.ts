import { runAiStudyWorkerCycle } from "../src/lib/ai-study-generation";
import { getAiStudyTaskQueueSettings } from "../src/lib/ai-study-task-queue";
import { prisma } from "../src/lib/prisma";
import { disconnectRedis } from "../src/lib/redis";

const pollIntervalMs = Number(process.env.AI_STUDY_WORKER_INTERVAL_MS || 5000);
const batchSize = Number(process.env.AI_STUDY_WORKER_BATCH_SIZE || 1);
let stopping = false;

async function main() {
  const queueSettings = getAiStudyTaskQueueSettings();
  console.log(
    [
      `AI study worker started. Poll interval: ${pollIntervalMs}ms, batch size: ${batchSize}`,
      queueSettings.configured
        ? `Redis Stream: ${queueSettings.streamKey}, group: ${queueSettings.groupName}, consumer: ${queueSettings.consumerName}, block: ${queueSettings.blockMs}ms, fallback scan: ${queueSettings.fallbackScanMs}ms`
        : "Redis Stream: disabled, using PostgreSQL polling"
    ].join("\n")
  );

  while (!stopping) {
    try {
      const result = await runAiStudyWorkerCycle(batchSize);
      if (result.processed > 0) {
        console.log(`AI study worker processed tasks=${result.processed}`);
      }
    } catch (error) {
      console.error("AI study worker cycle failed", error);
    }
    await sleep(pollIntervalMs);
  }
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function shutdown(signal: string) {
  if (stopping) {
    return;
  }
  stopping = true;
  console.log(`AI study worker received ${signal}, shutting down.`);
  await prisma.$disconnect();
  await disconnectRedis();
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

main()
  .catch((error) => {
    console.error("AI study worker stopped unexpectedly", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await disconnectRedis();
  });
