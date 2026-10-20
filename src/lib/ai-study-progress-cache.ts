import type { AiStudyGenerationTask, AiStudyProjectStatus, AiStudyTaskStatus, AiStudyTaskType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getRedisClient } from "@/lib/redis";

type ProgressTask = Pick<AiStudyGenerationTask, "id" | "projectId" | "sourceId" | "type" | "status" | "stage" | "errorMessage" | "createdAt" | "updatedAt">;

type ProgressProject = {
  id: string;
  status: AiStudyProjectStatus;
  learningReadyAt?: Date | string | null;
  cardJobs?: {status:string}[];
  tasks?: ProgressTask[];
};

export type AiStudyGenerationProgressStep = {
  taskId: string;
  type: AiStudyTaskType;
  status: AiStudyTaskStatus;
  stage: string | null;
  errorMessage: string | null;
  updatedAt: string;
};

export type AiStudyGenerationProgress = {
  projectId: string;
  status: AiStudyProjectStatus;
  percent: number;
  text: string;
  currentTaskType: AiStudyTaskType | null;
  stage: string | null;
  errorMessage: string | null;
  steps: AiStudyGenerationProgressStep[];
  updatedAt: string;
  learningAvailable?: boolean;
  cards?: {total:number;completed:number;unrequested:number;failed:number;paused:number};
};

const progressCachePrefix = `${process.env.AI_STUDY_PROGRESS_CACHE_PREFIX || "ai-study:project-progress"}:on-demand-v1`;
const processingTtlSeconds = getNumberEnv("AI_STUDY_PROGRESS_CACHE_PROCESSING_TTL_SECONDS", 180);
const finishedTtlSeconds = getNumberEnv("AI_STUDY_PROGRESS_CACHE_FINISHED_TTL_SECONDS", 600);

export async function readAiStudyProgressCache(projectId: string) {
  const redis = getRedisClient();
  if (!redis) {
    return null;
  }

  try {
    const raw = await redis.get(getAiStudyProgressCacheKey(projectId));
    return parseProgressSnapshot(raw);
  } catch (error) {
    console.warn(`AI study progress cache read failed for project=${projectId}`, error);
    return null;
  }
}

export async function attachAiStudyGenerationProgress<T extends ProgressProject>(
  projects: T[],
  options: { loadTasksOnMiss?: boolean } = {}
): Promise<Array<T & { generationProgress: AiStudyGenerationProgress }>> {
  if (projects.length === 0) {
    return projects.map((project) => ({ ...project, generationProgress: buildAiStudyGenerationProgress(project) }));
  }

  const cacheMap = await readAiStudyProgressCacheMap(projects.map((project) => project.id));
  // A cache miss must not discard per-card progress for an already usable book.
  await Promise.all(projects.filter(p=>p.learningReadyAt&&!cacheMap.has(p.id)).map(async p=>{const value=await loadAiStudyProjectProgressFromPostgres(p.id);if(value)cacheMap.set(p.id,value);}));
  const missingProcessingIds = projects
    .filter((project) => project.status === "processing" && !cacheMap.get(project.id) && options.loadTasksOnMiss)
    .map((project) => project.id);
  const tasksByProjectId = missingProcessingIds.length > 0
    ? await loadRecentTasksByProjectId(missingProcessingIds)
    : new Map<string, ProgressTask[]>();

  return projects.map((project) => {
    const cached = cacheMap.get(project.id);
    const fallbackTasks = project.tasks || tasksByProjectId.get(project.id);
    const generationProgress = cached || buildAiStudyGenerationProgress({ ...project, tasks: fallbackTasks });
    return { ...project, generationProgress };
  });
}

export async function getAiStudyProjectGenerationProgress(projectId: string) {
  const cached = await readAiStudyProgressCache(projectId);
  if (cached) {
    return cached;
  }

  return loadAiStudyProjectProgressFromPostgres(projectId);
}

export async function refreshAiStudyProgressCache(projectId: string) {
  return loadAiStudyProjectProgressFromPostgres(projectId);
}

async function loadAiStudyProjectProgressFromPostgres(projectId: string) {
  const project = await prisma.aiStudyProject.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      status: true,
      learningReadyAt: true,
      cardJobs: {select:{status:true}},
      tasks: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          projectId: true,
          sourceId: true,
          type: true,
          status: true,
          stage: true,
          errorMessage: true,
          createdAt: true,
          updatedAt: true
        }
      }
    }
  });

  if (!project) {
    return null;
  }

  const progress = buildAiStudyGenerationProgress(project);
  await writeAiStudyProgressCache(progress);
  return progress;
}

export async function writeAiStudyTaskProgressCache(task: ProgressTask) {
  const project = await prisma.aiStudyProject.findUnique({where:{id:task.projectId},select:{learningReadyAt:true}});
  if (project?.learningReadyAt) return refreshAiStudyProgressCache(task.projectId);
  const progress = buildAiStudyGenerationProgress({
    id: task.projectId,
    status: task.status === "failed" ? "failed" : "processing",
    tasks: [task]
  });
  await writeAiStudyProgressCache(progress);
  return progress;
}

export async function writeAiStudyProgressCache(progress: AiStudyGenerationProgress) {
  const redis = getRedisClient();
  if (!redis) {
    return false;
  }

  try {
    const ttl = progress.status === "processing" ? processingTtlSeconds : finishedTtlSeconds;
    await redis.set(getAiStudyProgressCacheKey(progress.projectId), JSON.stringify(progress), "EX", ttl);
    return true;
  } catch (error) {
    console.warn(`AI study progress cache write failed for project=${progress.projectId}`, error);
    return false;
  }
}

export async function clearAiStudyProgressCache(projectId: string) {
  const redis = getRedisClient();
  if (!redis) {
    return false;
  }

  try {
    await redis.del(getAiStudyProgressCacheKey(projectId));
    return true;
  } catch (error) {
    console.warn(`AI study progress cache clear failed for project=${projectId}`, error);
    return false;
  }
}

export function buildAiStudyGenerationProgress(project: ProgressProject): AiStudyGenerationProgress {
  const tasks = project.tasks || [];
  const steps = buildProgressSteps(tasks);
  const latestFailedTask = findLatestTask(tasks, (task) => task.status === "failed");
  const parseTask = findLatestTask(tasks, (task) => task.type === "parse_source");
  const outlineTask = findLatestTask(tasks, (task) => task.type === "generate_outline");
  const cardTask = findLatestTask(tasks, (task) => task.type === "generate_cards");

  if (project.learningReadyAt) {
    const jobs=project.cardJobs??[], completed=jobs.filter(j=>j.status==="succeeded").length;
    const unrequested=jobs.filter(j=>j.status==="unrequested").length;
    const failed=jobs.filter(j=>j.status==="failed").length, paused=jobs.filter(j=>j.status==="paused").length;
    const active=jobs.some(j=>j.status==="pending"||j.status==="running");
    const text=project.status==="ready"?"目录和详解已完成":jobs.length?`目录和原文可学习 · AI详解按需生成 ${completed}/${jobs.length}${active?"，已请求的详解生成中":""}${failed+paused?`，${failed+paused} 张待重试`:""}`:"目录和原文已可学习，正在登记详解入口";
    return {...buildProgress(project.id,project.status,100,text,null,"learning_ready",null,steps),learningAvailable:true,cards:{total:jobs.length,completed,unrequested,failed,paused}};
  }

  if (project.status === "ready") {
    return buildProgress(project.id, project.status, 100, "知识图谱已生成", null, "ready", null, steps);
  }
  if (project.status === "failed") {
    const failureText = latestFailedTask?.type === "generate_outline" ? "知识框架生成失败" : latestFailedTask?.type === "generate_cards" ? "知识卡片生成失败" : "资料解析失败";
    return buildProgress(project.id, project.status, 100, failureText, latestFailedTask?.type || null, latestFailedTask?.stage || "failed", latestFailedTask?.errorMessage || null, steps);
  }
  if (project.status !== "processing") {
    return buildProgress(project.id, project.status, 0, "等待创建", null, project.status, null, steps);
  }

  if (cardTask?.status === "running") {
    const match = String(cardTask.stage || "").match(/generating_card_(\d+)_of_(\d+)/);
    if (match) {
      const current = Number(match[1]);
      const total = Number(match[2]);
      const cardPercent = total > 0 ? Math.round((current / total) * 28) : 0;
      return buildProgress(project.id, project.status, Math.min(94, 66 + cardPercent), `正在生成知识卡片 ${current}/${total}`, cardTask.type, cardTask.stage, null, steps);
    }
    return buildProgress(project.id, project.status, 72, "正在生成知识卡片...", cardTask.type, cardTask.stage, null, steps);
  }
  if (cardTask?.status === "pending") {
    return buildProgress(project.id, project.status, 66, "等待生成知识卡片...", cardTask.type, cardTask.stage, null, steps);
  }
  if (outlineTask?.status === "running") {
    const batch = String(outlineTask.stage || "").match(/planning_(?:evidence|chapter)_(\d+)_of_(\d+)/);
    if (batch) return buildProgress(project.id, project.status, Math.min(55, 38 + Math.round(Number(batch[1]) / Number(batch[2]) * 17)), `正在提取知识点 ${batch[1]}/${batch[2]}`, outlineTask.type, outlineTask.stage, null, steps);
    if (String(outlineTask.stage).startsWith("organizing_")) return buildProgress(project.id, project.status, 58, "正在组织完整知识目录...", outlineTask.type, outlineTask.stage, null, steps);
    return buildProgress(project.id, project.status, 46, "正在生成思维导图...", outlineTask.type, outlineTask.stage, null, steps);
  }
  if (outlineTask?.status === "pending") {
    return buildProgress(project.id, project.status, 38, "等待生成思维导图...", outlineTask.type, outlineTask.stage, null, steps);
  }
  if (parseTask?.status === "running") {
    const percent = parseTask.stage === "submitting_to_mineru" ? 20 : parseTask.stage === "mineru_result_persisted" ? 32 : 18;
    const text = parseTask.stage === "inspecting_pdf_parts" ? "正在检查并拆分大 PDF..." : "AI 正在解析资料...";
    return buildProgress(project.id, project.status, percent, text, parseTask.type, parseTask.stage, null, steps);
  }
  if (parseTask?.status === "pending") {
    return buildProgress(project.id, project.status, 8, "等待解析资料...", parseTask.type, parseTask.stage, null, steps);
  }

  return buildProgress(project.id, project.status, 8, "搭子加急制作中...", null, "processing", null, steps);
}

async function readAiStudyProgressCacheMap(projectIds: string[]) {
  const redis = getRedisClient();
  const result = new Map<string, AiStudyGenerationProgress>();
  if (!redis || projectIds.length === 0) {
    return result;
  }

  try {
    const values = await redis.mget(projectIds.map(getAiStudyProgressCacheKey));
    values.forEach((value, index) => {
      const parsed = parseProgressSnapshot(value);
      if (parsed) {
        result.set(projectIds[index], parsed);
      }
    });
  } catch (error) {
    console.warn("AI study progress cache batch read failed", error);
  }

  return result;
}

async function loadRecentTasksByProjectId(projectIds: string[]) {
  const tasks = await prisma.aiStudyGenerationTask.findMany({
    where: { projectId: { in: projectIds } },
    orderBy: [{ projectId: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      projectId: true,
      sourceId: true,
      type: true,
      status: true,
      stage: true,
      errorMessage: true,
      createdAt: true,
      updatedAt: true
    }
  });
  const grouped = new Map<string, ProgressTask[]>();
  for (const task of tasks) {
    const current = grouped.get(task.projectId) || [];
    if (current.length < 5) {
      current.push(task);
      grouped.set(task.projectId, current);
    }
  }
  return grouped;
}

function buildProgress(
  projectId: string,
  status: AiStudyProjectStatus,
  percent: number,
  text: string,
  currentTaskType: AiStudyTaskType | null,
  stage: string | null,
  errorMessage: string | null,
  steps: AiStudyGenerationProgressStep[]
): AiStudyGenerationProgress {
  return {
    projectId,
    status,
    percent: Math.max(0, Math.min(100, percent)),
    text,
    currentTaskType,
    stage,
    errorMessage,
    steps,
    updatedAt: new Date().toISOString()
  };
}

function buildProgressSteps(tasks: ProgressTask[]) {
  const latestByType = new Map<AiStudyTaskType, ProgressTask>();
  for (const task of sortTasksDesc(tasks)) {
    if (!latestByType.has(task.type)) {
      latestByType.set(task.type, task);
    }
  }

  return ["parse_source", "generate_outline", "generate_cards"]
    .map((type) => latestByType.get(type as AiStudyTaskType))
    .filter((task): task is ProgressTask => Boolean(task))
    .map((task) => ({
      taskId: task.id,
      type: task.type,
      status: task.status,
      stage: task.stage,
      errorMessage: task.errorMessage,
      updatedAt: toIsoString(task.updatedAt)
    }));
}

function findLatestTask(tasks: ProgressTask[], predicate: (task: ProgressTask) => boolean) {
  return sortTasksDesc(tasks).find(predicate) || null;
}

function sortTasksDesc(tasks: ProgressTask[]) {
  return [...tasks].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

function parseProgressSnapshot(raw: string | null) {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AiStudyGenerationProgress>;
    if (!parsed.projectId || typeof parsed.percent !== "number" || !parsed.text) {
      return null;
    }
    return {
      projectId: parsed.projectId,
      status: parsed.status || "processing",
      percent: parsed.percent,
      text: parsed.text,
      currentTaskType: parsed.currentTaskType || null,
      stage: parsed.stage || null,
      errorMessage: parsed.errorMessage || null,
      steps: Array.isArray(parsed.steps) ? parsed.steps : [],
      learningAvailable: parsed.learningAvailable,
      cards: parsed.cards,
      updatedAt: parsed.updatedAt || new Date().toISOString()
    } as AiStudyGenerationProgress;
  } catch {
    return null;
  }
}

function getAiStudyProgressCacheKey(projectId: string) {
  return `${progressCachePrefix}:${projectId}`;
}

function toIsoString(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function getNumberEnv(name: string, defaultValue: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : defaultValue;
}
