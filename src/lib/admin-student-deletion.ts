import { Prisma } from "@prisma/client";
import { clearAiStudyProgressCache } from "@/lib/ai-study-progress-cache";
import { deleteAiStudyObject } from "@/lib/ai-study-storage";
import { getAvatarStorageKeyFromUrl } from "@/lib/avatar-storage";
import { prisma } from "@/lib/prisma";

type StudentStorageSource = {
  id: string;
  storageKey: string | null;
  parseManifestKey: string | null;
  parseContentListKey: string | null;
  parseMarkdownKey: string | null;
  blocks: Array<{ assetKey: string | null }>;
};

type StudentStorageProject = {
  id: string;
  sources: StudentStorageSource[];
};

export type StudentStorageRecord = {
  studentProfile: { avatarImage: string | null } | null;
  aiStudyProjects: StudentStorageProject[];
};

export class StudentDeletionError extends Error {
  constructor(
    public readonly code: "NOT_FOUND" | "ACTIVE_AI_TASKS" | "OFFICIAL_MATERIALS" | "RELATION_BLOCKED",
    message: string
  ) {
    super(message);
    this.name = "StudentDeletionError";
  }
}

export function collectStudentStorageKeys(student: StudentStorageRecord) {
  const keys = new Set<string>();
  const addKey = (key: string | null | undefined) => {
    const normalized = key?.trim();
    if (normalized) {
      keys.add(normalized);
    }
  };

  if (student.studentProfile?.avatarImage) {
    addKey(getAvatarStorageKeyFromUrl(student.studentProfile.avatarImage));
  }

  for (const project of student.aiStudyProjects) {
    for (const source of project.sources) {
      addKey(source.storageKey);
      addKey(source.parseManifestKey);
      addKey(source.parseContentListKey);
      addKey(source.parseMarkdownKey);

      const artifactPrefix = `ai-study/${project.id}/${source.id}/mineru`;
      addKey(`${artifactPrefix}/document.md`);
      addKey(`${artifactPrefix}/content-list.json`);
      addKey(`${artifactPrefix}/middle.json`);
      addKey(`${artifactPrefix}/manifest.json`);

      for (const block of source.blocks) {
        addKey(block.assetKey);
      }
    }
  }

  return Array.from(keys);
}

async function deleteStorageKeysInBatches(keys: string[], batchSize = 10) {
  let failureCount = 0;

  for (let index = 0; index < keys.length; index += batchSize) {
    const results = await Promise.allSettled(
      keys.slice(index, index + batchSize).map((key) => deleteAiStudyObject(key))
    );
    failureCount += results.filter((result) => result.status === "rejected").length;
  }

  return failureCount;
}

export async function deleteStudentAccountByAdmin(studentId: string) {
  const student = await prisma.user.findFirst({
    where: { id: studentId, role: "student" },
    select: {
      id: true,
      username: true,
      email: true,
      studentProfile: {
        select: { avatarImage: true }
      },
      officialStudyMaterialsCreated: {
        select: { id: true },
        take: 1
      },
      aiStudyProjects: {
        select: {
          id: true,
          tasks: {
            where: { status: { in: ["pending", "running"] } },
            select: { id: true },
            take: 1
          },
          sources: {
            select: {
              id: true,
              storageKey: true,
              parseManifestKey: true,
              parseContentListKey: true,
              parseMarkdownKey: true,
              blocks: {
                select: { assetKey: true }
              }
            }
          }
        }
      }
    }
  });

  if (!student) {
    throw new StudentDeletionError("NOT_FOUND", "学生不存在或已被删除");
  }
  if (student.officialStudyMaterialsCreated.length > 0) {
    throw new StudentDeletionError(
      "OFFICIAL_MATERIALS",
      "该学生关联了其创建的官方学习资料，请先转移资料创建者后再删除"
    );
  }
  if (student.aiStudyProjects.some((project) => project.tasks.length > 0)) {
    throw new StudentDeletionError(
      "ACTIVE_AI_TASKS",
      "该学生仍有正在排队或生成中的 AI 学习任务，请等待任务结束后再删除"
    );
  }

  const storageKeys = collectStudentStorageKeys(student);
  const projectIds = student.aiStudyProjects.map((project) => project.id);

  try {
    await prisma.$transaction(async (transaction) => {
      if (student.email) {
        await transaction.emailVerificationCode.deleteMany({
          where: { email: student.email }
        });
      }
      await transaction.user.delete({ where: { id: student.id } });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") {
        throw new StudentDeletionError("NOT_FOUND", "学生不存在或已被删除");
      }
      if (error.code === "P2003") {
        throw new StudentDeletionError(
          "RELATION_BLOCKED",
          "该学生仍有关联数据阻止删除，请先处理关联数据后再重试"
        );
      }
    }
    throw error;
  }

  const storageCleanupFailureCount = await deleteStorageKeysInBatches(storageKeys);
  const cacheResults = await Promise.all(projectIds.map((projectId) => clearAiStudyProgressCache(projectId)));
  const cacheCleanupFailureCount = cacheResults.filter((cleared) => !cleared).length;

  if (storageCleanupFailureCount > 0 || cacheCleanupFailureCount > 0) {
    console.warn("Student external resource cleanup was incomplete", {
      studentId: student.id,
      storageCleanupFailureCount,
      cacheCleanupFailureCount
    });
  }

  return {
    username: student.username,
    storageCleanupFailureCount,
    cacheCleanupFailureCount
  };
}
