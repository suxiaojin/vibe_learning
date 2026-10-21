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
  const projectInclude = {
    owner: {
      select: {
        id: true,
        username: true,
        studentProfile: { select: { nickname: true } }
      }
    },
    _count: {
      select: { purchases: { where: adminPurchaseStudentWhere } }
    },
    tasks: {
      where: { type: "generate_cards", status: "succeeded" },
      select: { id: true },
      take: 1
    }
  } satisfies Prisma.AiStudyProjectInclude;

  const [projects, filteredCount, activeCount, publicCount, pendingCount] = await Promise.all([
    prisma.aiStudyProject.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      take: 200,
      include: projectInclude
    }),
    countAdminAiStudyProjectGroups(where),
    countAdminAiStudyProjectGroups({ deletedAt: null }),
    countAdminAiStudyProjectGroups({
      visibility: "public", deletedAt: null,
      OR: [
        { status: "ready" },
        { partGroupId: { not: null }, learningReadyAt: { not: null }, tasks: { some: { type: "generate_cards", status: "succeeded" } } }
      ]
    }),
    countAdminAiStudyProjectGroups({ visibility: "public_pending", deletedAt: null })
  ]);
  const partGroupIds = Array.from(new Set(projects
    .filter((project) => project.partGroupId && (project.partCount ?? 0) > 1)
    .map((project) => project.partGroupId!)));
  const siblings = partGroupIds.length > 0
    ? await prisma.aiStudyProject.findMany({
      where: { partGroupId: { in: partGroupIds } },
      include: projectInclude
    })
    : [];
  const allVisibleProjects = new Map([...projects, ...siblings].map((project) => [project.id, project]));

  return {
    filters,
    groups: groupAdminAiStudyProjects(Array.from(allVisibleProjects.values())),
    stats: {
      filteredCount,
      activeCount,
      publicCount,
      pendingCount
    }
  };
}

export function groupAdminAiStudyProjects<T extends {
  id: string;
  title: string;
  partGroupId: string | null;
  partIndex: number | null;
  partCount: number | null;
  createdAt: Date;
}>(projects: T[]) {
  const groups = new Map<string, {
    id: string;
    title: string;
    isPartGroup: boolean;
    expectedPartCount: number;
    createdAt: Date;
    parts: T[];
  }>();
  for (const project of projects) {
    const isPartGroup = Boolean(project.partGroupId && (project.partCount ?? 0) > 1);
    const id = isPartGroup ? project.partGroupId! : project.id;
    const group = groups.get(id);
    if (group) {
      group.parts.push(project);
      if (project.createdAt > group.createdAt) group.createdAt = project.createdAt;
      group.expectedPartCount = Math.max(group.expectedPartCount, project.partCount ?? 1);
    } else {
      groups.set(id, {
        id,
        title: project.title,
        isPartGroup,
        expectedPartCount: project.partCount ?? 1,
        createdAt: project.createdAt,
        parts: [project]
      });
    }
  }
  return Array.from(groups.values()).map((group) => {
    group.parts.sort((a, b) => (a.partIndex ?? 1) - (b.partIndex ?? 1) || a.id.localeCompare(b.id));
    if (group.isPartGroup) group.title = stripAiStudyPartTitle(group.parts[0].title);
    return group;
  }).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id));
}

function stripAiStudyPartTitle(title: string) {
  return title
    .replace(/^\[Part\.\d+\/\d+\]\s*/i, "")
    .replace(/\s*[（(]原文第\d+\s*[-–—]\s*\d+页[）)]\s*$/, "")
    .trim();
}

async function countAdminAiStudyProjectGroups(where: Prisma.AiStudyProjectWhereInput) {
  const [singleCount, partGroups] = await Promise.all([
    prisma.aiStudyProject.count({
      where: { AND: [where, { OR: [{ partGroupId: null }, { partCount: null }, { partCount: { lte: 1 } }] }] }
    }),
    prisma.aiStudyProject.groupBy({
      by: ["partGroupId"],
      where: { AND: [where, { partGroupId: { not: null }, partCount: { gt: 1 } }] }
    })
  ]);
  return singleCount + partGroups.length;
}

export async function getAdminAiStudyProject(projectId: string) {
  return prisma.aiStudyProject.findUnique({
    where: { id: projectId },
    include: {
      cardJobs: {orderBy:{updatedAt:"desc"},select:{id:true,nodeId:true,status:true,attempts:true,errorMessage:true,errorKind:true,qualityFlags:true,node:{select:{title:true}}}},
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
