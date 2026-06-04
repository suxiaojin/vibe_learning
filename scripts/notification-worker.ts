import { runNotificationWorkerCycle } from "../src/lib/notification-dispatch";
import { prisma } from "../src/lib/prisma";

const pollIntervalMs = Number(process.env.NOTIFICATION_WORKER_INTERVAL_MS || 5000);
let stopping = false;

async function main() {
  console.log(`Notification worker started. Poll interval: ${pollIntervalMs}ms`);
  while (!stopping) {
    try {
      const result = await runNotificationWorkerCycle();
      if (result.events > 0 || result.jobs > 0) {
        console.log(`Notification worker processed events=${result.events}, jobs=${result.jobs}`);
      }
    } catch (error) {
      console.error("Notification worker cycle failed", error);
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
  console.log(`Notification worker received ${signal}, shutting down.`);
  await prisma.$disconnect();
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

main()
  .catch((error) => {
    console.error("Notification worker stopped unexpectedly", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
