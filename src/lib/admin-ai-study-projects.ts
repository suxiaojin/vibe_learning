import type { AiStudyProjectStatus, AiStudyVisibility, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { adminPurchaseStudentWhere } from "@/lib/admin-study-project-purchases";

export const adminAiStudyProjectStatuses = ["draft", "processing", "ready", "failed", "archived"] as const;
export const adminAiStudyVisibilityStatuses = ["private", "public_pending", "public", "rejected"] as const;

export type AdminAiStudyProjectFilters = {
  keyword?: string;
  status?: string;
  visibility?: string;
};

export function resolveAdminAiStudyProjectFilters(input: AdminAiStudyProjectFilters = {}) {
  const keyword = (input.keyword || "").trim().slice(0, 120);
  const status: AiStudyProjectStatus | "" = adminAiStudyProjectStatuses.includes(input.status as AiStudyProjectStatus)
    ? (input.status as AiStudyProjectStatus)
    : "";
  const visibility: AiStudyVisibility | "" = adminAiStudyVisibilityStatuses.includes(input.visibility as AiStudyVisibility)
    ? (input.visibility as AiStudyVisibility)
    : "";

  return { keyword, status, visibility };
}

export function buildAdminAiStudyProjectsPath(input: AdminAiStudyProjectFilters = {}) {
  const filters = resolveAdminAiStudyProjectFilters(input);
  const params = new URLSearchParams();
  if (filters.keyword) {
    params.set("keyword", filters.keyword);
  }
  if (filters.status) {
    params.set("status", filters.status);
  }
  if (filters.visibility) {
    params.set("visibility", filters.visibility);
  }
  const query = params.toString();
  return query ? `/admin/ai-study-projects?${query}` : "/admin/ai-study-projects";
}

export async function listAdminAiStudyProjects(input: AdminAiStudyProjectFilters = {}) {
  const filters = resolveAdminAiStudyProjectFilters(input);
  const where = buildProjectWhere(filters);

  const [projects, filteredCount, activeCount, publicCount, pendingCount] = await Promise.all([
    prisma.aiStudyProject.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      take: 200,
      include: {
        owner: {
          select: {
            id: true,
            username: true,
            status: true,
            studentProfile: {
              select: {
                nickname: true
              }
            }
          }
        },
        sources: {
          orderBy: { createdAt: "desc" },
          take: 2,
          select: {
            id: true,
            fileName: true,
            storageBucket: true,
            storageKey: true,
            storagePath: true
          }
        },
        tasks: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            type: true,
            status: true,
            stage: true,
            errorMessage: true,
            updatedAt: true
          }
        },
        _count: {
          select: {
            sources: true,
            sourceChunks: true,
            purchases: { where: adminPurchaseStudentWhere },
            nodes: true,
            cards: true,
            tasks: true
          }
        }
      }
    }),
    prisma.aiStudyProject.count({ where }),
    prisma.aiStudyProject.count({ where: { deletedAt: null } }),
    prisma.aiStudyProject.count({ where: { visibility: "public", status: "ready", deletedAt: null } }),
    prisma.aiStudyProject.count({ where: { visibility: "public_pending", deletedAt: null } })
  ]);

  return {
    filters,
    projects,
    stats: {
      filteredCount,
      activeCount,
      publicCount,
      pendingCount
    }
  };
}

export async function getAdminAiStudyProject(projectId: string) {
  return prisma.aiStudyProject.findUnique({
    where: { id: projectId },
    include: {
      owner: {
        select: {
          id: true,
          username: true,
          status: true,
          createdAt: true,
          studentProfile: {
            select: {
              nickname: true,
              major: {
                select: {
                  name: true
                }
              },
              region: {
                select: {
                  province: true,
                  studySystem: true
                }
              }
            }
          }
        }
      },
      sources: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          sourceType: true,
          fileName: true,
          mimeType: true,
          fileSizeBytes: true,
          storageBucket: true,
          storageKey: true,
          storagePath: true,
          pageCount: true,
          status: true,
          createdAt: true
        }
      },
      tasks: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          sourceId: true,
          type: true,
          status: true,
          stage: true,
          errorMessage: true,
          retryCount: true,
          startedAt: true,
          finishedAt: true,
          createdAt: true,
          updatedAt: true
        }
      },
      _count: {
        select: {
          sources: true,
          sourceChunks: true,
          nodes: true,
          cards: true,
          tasks: true,
          progress: true,
          chatMessages: true
        }
      }
    }
  });
}

export function getAiStudySourceDirectory(source: {
  storageBucket: string | null;
  storageKey: string | null;
  storagePath: string | null;
}) {
  if (source.storageBucket && source.storageKey) {
    return `s3://${source.storageBucket}/${dirname(source.storageKey)}`;
  }
  if (source.storagePath) {
    return dirname(source.storagePath);
  }
  if (source.storageKey) {
    return dirname(source.storageKey);
  }
  return "";
}

export function getAiStudyProjectSourceDirectories(
  sources: Array<{ storageBucket: string | null; storageKey: string | null; storagePath: string | null }>
) {
  return Array.from(new Set(sources.map(getAiStudySourceDirectory).filter(Boolean)));
}

function buildProjectWhere(filters: ReturnType<typeof resolveAdminAiStudyProjectFilters>): Prisma.AiStudyProjectWhereInput {
  const and: Prisma.AiStudyProjectWhereInput[] = [];

  if (filters.keyword) {
    and.push({
      OR: [
        { title: { contains: filters.keyword, mode: "insensitive" } },
        {
          owner: {
            is: {
              OR: [
                { username: { contains: filters.keyword, mode: "insensitive" } },
                {
                  studentProfile: {
                    is: {
                      nickname: { contains: filters.keyword, mode: "insensitive" }
                    }
                  }
                }
              ]
            }
          }
        },
        {
          sources: {
            some: {
              OR: [
                { fileName: { contains: filters.keyword, mode: "insensitive" } },
                { storageKey: { contains: filters.keyword, mode: "insensitive" } },
                { storagePath: { contains: filters.keyword, mode: "insensitive" } }
              ]
            }
          }
        }
      ]
    });
  }

  if (filters.status) {
    and.push({ status: filters.status });
  }
  if (filters.visibility) {
    and.push({ visibility: filters.visibility });
  }
  return and.length > 0 ? { AND: and } : {};
}

function dirname(value: string) {
  const normalized = value.replace(/\/+$/, "");
  const index = normalized.lastIndexOf("/");
  return index > 0 ? normalized.slice(0, index) : normalized;
}
