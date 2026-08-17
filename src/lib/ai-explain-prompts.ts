import { prisma } from "@/lib/prisma";

type PromptProfileSelection = {
  cacheInvalidatedAt: Date | null;
  activeVersion: {
    id: string;
    version: number;
    systemPrompt: string;
    userPromptTemplate: string;
    invalidateExisting: boolean;
  } | null;
};

export async function resolveAiExplainPromptContext({
  questionId,
  sessionId,
  userId
}: {
  questionId: string;
  sessionId?: string;
  userId: string;
}) {
  let course: {
    id: string;
    name: string;
    regionId: string;
    majorId: string | null;
    aiExplainPromptProfile: PromptProfileSelection | null;
  } | null = null;

  if (sessionId) {
    const session = await prisma.quizSession.findFirst({
      where: {
        id: sessionId,
        userId,
        attempts: { some: { questionId } }
      },
      select: {
        syllabusItem: {
          select: {
            course: {
              select: {
                id: true,
                name: true,
                regionId: true,
                majorId: true,
                aiExplainPromptProfile: {
                  select: {
                    cacheInvalidatedAt: true,
                    activeVersion: {
                      select: {
                        id: true,
                        version: true,
                        systemPrompt: true,
                        userPromptTemplate: true,
                        invalidateExisting: true
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });
    if (!session) {
      return {
        course: null,
        promptVersion: null,
        cacheInvalidatedAt: null,
        validSession: false
      };
    }
    course = session.syllabusItem.course;
  }

  const regionMajorPromptProfile = course?.majorId
    ? await prisma.regionMajor.findUnique({
        where: { regionId_majorId: { regionId: course.regionId, majorId: course.majorId } },
        select: {
          aiExplainPromptProfile: {
            select: {
              cacheInvalidatedAt: true,
              activeVersion: {
                select: {
                  id: true,
                  version: true,
                  systemPrompt: true,
                  userPromptTemplate: true,
                  invalidateExisting: true
                }
              }
            }
          }
        }
      })
    : null;
  const assignedPromptProfile = regionMajorPromptProfile?.aiExplainPromptProfile || course?.aiExplainPromptProfile || null;
  const coursePromptVersion = assignedPromptProfile?.activeVersion || null;
  const defaultProfile = coursePromptVersion
    ? null
    : await prisma.aiExplainPromptProfile.findFirst({
        where: { isDefault: true },
        select: {
          cacheInvalidatedAt: true,
          activeVersion: {
            select: {
              id: true,
              version: true,
              systemPrompt: true,
              userPromptTemplate: true,
              invalidateExisting: true
            }
          }
        }
      });

  return {
    course: course ? { id: course.id, name: course.name } : null,
    promptVersion: coursePromptVersion || defaultProfile?.activeVersion || null,
    cacheInvalidatedAt: coursePromptVersion
      ? assignedPromptProfile?.cacheInvalidatedAt || null
      : defaultProfile?.cacheInvalidatedAt || null,
    validSession: true
  };
}
