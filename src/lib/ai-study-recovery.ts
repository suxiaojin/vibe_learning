import { chapterProtocol } from "./ai-study-chapter-curriculum";

type RecoveryTask = { id: string; type: string; status: string; inputSummary: unknown; outputSummary: unknown };
export type RecoveryProject = {
  deletedAt: Date | null; status: string; tasks: RecoveryTask[];
  sources: { status: string }[]; _count: { sourceChunks: number; cards: number };
};
export const recoveryRecord = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

// Tasks must be passed newest first. Preserve failed attempts and only reuse
// cards when their successful outline belongs to this exact generation protocol.
export function planAiStudyRecovery(project: RecoveryProject, expectedTaskId?: string) {
  if (project.deletedAt || project.status !== "failed") throw new Error("仅能续跑未删除的失败项目；不会覆盖已完成或进行中的项目。");
  if (project.tasks.some((task) => task.status === "pending" || task.status === "running")) throw new Error("仍有待执行或运行中的任务，不能重复入队。");
  const failed = project.tasks.find((task) => task.status === "failed");
  if (!failed || (expectedTaskId && failed.id !== expectedTaskId)) throw new Error("失败任务已变化，请重新预览。");
  if (!project.sources.length || !project._count.sourceChunks || project.sources.some((source) => source.status !== "parsed")) throw new Error("资料尚未完整解析，需要先排查解析任务。");
  if (failed.type !== "generate_outline" && failed.type !== "generate_cards") throw new Error("此入口仅处理知识框架或卡片生成失败。");
  const input = recoveryRecord(failed.inputSummary);
  const outline = project.tasks.find((task) => task.id === input.outlineTaskId && task.type === "generate_outline" && task.status === "succeeded");
  const protocol=recoveryRecord(outline?.outputSummary).generationProtocol;
  const canResumeCards = failed.type === "generate_cards" && protocol === chapterProtocol;
  return { failed, type: canResumeCards ? "generate_cards" as const : "generate_outline" as const, protocol:canResumeCards?String(protocol):chapterProtocol };
}
