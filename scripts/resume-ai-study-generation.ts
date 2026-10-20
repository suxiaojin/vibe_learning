import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { enqueueAiStudyTask } from "../src/lib/ai-study-task-queue";
import { refreshAiStudyProgressCache } from "../src/lib/ai-study-progress-cache";
import { disconnectRedis } from "../src/lib/redis";
import { planAiStudyRecovery, recoveryRecord as record } from "../src/lib/ai-study-recovery";

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

// Operator recovery, preview by default. The original failed attempt remains in
// history. It never changes a ready project or calls purchase/diamond code.
async function main() {
  const args = process.argv.slice(2);
  const option = (name: string) => args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);
  const projectId = option("--project"), expectedTaskId = option("--expected-task"), apply = args.includes("--apply");
  if (!projectId || args.some((arg) => arg !== "--apply" && !arg.startsWith("--project=") && !arg.startsWith("--expected-task="))) throw new Error("用法：--project=<id> [--expected-task=<预览返回的id> --apply]");
  if (apply && !expectedTaskId) throw new Error("执行续跑必须带预览确认的--expected-task，防止恢复错误任务。");
  const inspect = async (db: Prisma.TransactionClient) => {
    const project = await db.aiStudyProject.findUniqueOrThrow({ where: { id: projectId }, include: {
      tasks: { orderBy: { createdAt: "desc" } }, sources: { select: { id: true, status: true } },
      _count: { select: { sourceChunks: true, cards: true } }
    } });
    return { project, ...planAiStudyRecovery(project, expectedTaskId) };
  };
  const preview = await inspect(prisma);
  console.log(JSON.stringify({ mode: apply ? "apply" : "preview", projectId, title: preview.project.title, expectedTaskId: preview.failed.id,
    resumeType: preview.type, retainedSourceChunks: preview.project._count.sourceChunks,
    retainedCards: preview.type === "generate_cards" ? preview.project._count.cards : 0,
    willReplaceIncompleteOutline: preview.type === "generate_outline", reparsesSource: false, chargesDiamonds: false }, null, 2));
  if (!apply) return;
  const task = await prisma.$transaction(async (tx) => {
    // Serialize operator requests for this project; re-read after acquiring lock.
    await tx.$queryRaw`SELECT id FROM ai_study_projects WHERE id = ${projectId} FOR UPDATE`;
    const { project, failed, type, protocol } = await inspect(tx);
    const next = await tx.aiStudyGenerationTask.create({ data: {
      projectId: project.id, type, stage: "waiting_for_recovery",
      inputSummary: json({ ...(type === "generate_cards" ? record(failed.inputSummary) : {}), resumedFromTaskId: failed.id, generationProtocol: protocol }),
      outputSummary: json(type === "generate_outline" && failed.type === "generate_outline" ? { curriculumCheckpoint: record(failed.outputSummary).curriculumCheckpoint ?? null } : {})
    } });
    await tx.aiStudyProject.update({ where: { id: project.id }, data: { status: "processing" } });
    return next;
  });
  const queued = await enqueueAiStudyTask(task);
  await refreshAiStudyProgressCache(projectId);
  console.log(JSON.stringify({ createdTaskId: task.id, queued, postgresFallback: !queued }));
}
main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; })
  .finally(async () => { await disconnectRedis(); await prisma.$disconnect(); });
