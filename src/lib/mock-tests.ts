import { getStudentFoundationProfile } from "@/lib/foundation";
import { prisma } from "@/lib/prisma";
import type { LearningOwnerType } from "@/lib/syllabus-learning";

export type MockTestQuestion = {
  id: string;
  type: string;
  stem: string;
  options: unknown;
  answer: unknown;
  analysis: string;
  showAnalysis: boolean;
  fillBlankScored: boolean;
  difficulty: string;
  source: string;
  sourceYear: number | null;
  knowledgePointTitle: string;
  questionBank: {
    id: string;
    title: string;
    year: number | null;
    paperType: string;
  };
};

export type MockTestSection = {
  id: string;
  title: string;
  courseTitle: string;
  scopeType: "chapter" | "course";
  sortOrder: number;
  questions: MockTestQuestion[];
};

export type MockTestContext = {
  group: { key: LearningOwnerType; name: string } | null;
  courseKey: LearningOwnerType;
  practiceSections: MockTestSection[];
};

export function normalizeMockTestCourseKey(value?: string | null): LearningOwnerType {
  return value === "public_subject" ? "public_subject" : "major";
}

export async function getMockTestContext(userId: string, courseKey: LearningOwnerType): Promise<MockTestContext> {
  const profile = await getStudentFoundationProfile(userId);
  const ownerId = courseKey === "major" ? profile?.majorId : profile?.publicSubjectId;
  const ownerName = courseKey === "major" ? profile?.major?.name : profile?.publicSubject?.name;

  if (!profile?.regionId || !ownerId || !ownerName) {
    return { group: null, courseKey, practiceSections: [] };
  }

  const courses = await prisma.learningCourse.findMany({
    where: {
      regionId: profile.regionId,
      status: "published",
      courseType: courseKey,
      ...(courseKey === "major" ? { majorId: ownerId } : { publicSubjectId: ownerId })
    },
    select: {
      id: true,
      name: true,
      sortOrder: true,
      syllabusItems: {
        where: {
          status: "published",
          OR: [
            { checkpointScope: "course" },
            { parentId: null, checkpointScope: null }
          ],
          challengeVersions: {
            some: {
              purpose: "special_practice",
              status: "published",
              questions: { some: {} }
            }
          }
        },
        select: {
          id: true,
          title: true,
          sortOrder: true,
          checkpointScope: true,
          challengeVersions: {
            where: {
              purpose: "special_practice",
              status: "published",
              questions: { some: {} }
            },
            orderBy: { version: "asc" },
            select: {
              version: true,
              questions: {
                where: {
                  question: {
                    status: "published",
                    paperQuestions: { some: { paper: { status: "published" } } }
                  }
                },
                orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
                select: {
                  question: {
                    select: {
                      id: true,
                      type: true,
                      stem: true,
                      options: true,
                      answer: true,
                      analysis: true,
                      showAnalysis: true,
                      fillBlankScored: true,
                      difficulty: true,
                      source: true,
                      sourceYear: true,
                      knowledgeTags: {
                        select: { syllabusItem: { select: { title: true } } },
                        orderBy: { createdAt: "asc" }
                      },
                      paperQuestions: {
                        where: { paper: { status: "published" } },
                        select: {
                          sortOrder: true,
                          paper: {
                            select: {
                              id: true,
                              title: true,
                              year: true,
                              paperType: true,
                              sortOrder: true
                            }
                          }
                        },
                        orderBy: [{ paper: { sortOrder: "asc" } }, { sortOrder: "asc" }]
                      }
                    }
                  }
                }
              }
            }
          }
        },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
      }
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
  });

  const practiceSections = courses.flatMap((course) => {
    return [...course.syllabusItems]
      .sort((left, right) => {
        const leftRank = left.checkpointScope === "course" ? 0 : 1;
        const rightRank = right.checkpointScope === "course" ? 0 : 1;
        return leftRank - rightRank || left.sortOrder - right.sortOrder;
      })
      .flatMap((item) => {
        const questions = new Map<string, MockTestQuestion>();

        for (const version of item.challengeVersions) {
          for (const challengeQuestion of version.questions) {
            const question = challengeQuestion.question;
            const paperQuestion = question.paperQuestions[0];
            if (!paperQuestion || questions.has(question.id)) {
              continue;
            }
            questions.set(question.id, {
              id: question.id,
              type: question.type,
              stem: question.stem,
              options: question.options,
              answer: question.answer,
              analysis: question.analysis,
              showAnalysis: question.showAnalysis,
              fillBlankScored: question.fillBlankScored,
              difficulty: question.difficulty,
              source: question.source,
              sourceYear: question.sourceYear,
              knowledgePointTitle: question.knowledgeTags[0]?.syllabusItem.title || item.title,
              questionBank: {
                id: paperQuestion.paper.id,
                title: paperQuestion.paper.title,
                year: paperQuestion.paper.year,
                paperType: paperQuestion.paper.paperType
              }
            });
          }
        }

        return questions.size > 0
          ? [{
              id: item.id,
              title: item.checkpointScope === "course" ? course.name : item.title,
              courseTitle: course.name,
              scopeType: item.checkpointScope === "course" ? "course" as const : "chapter" as const,
              sortOrder: item.sortOrder,
              questions: [...questions.values()]
            }]
          : [];
      });
  });

  return {
    group: { key: courseKey, name: ownerName },
    courseKey,
    practiceSections
  };
}

export function pickRandomMockQuestions(questions: MockTestQuestion[], limit = 10) {
  return [...questions]
    .map((question) => ({ question, weight: Math.random() }))
    .sort((left, right) => left.weight - right.weight)
    .slice(0, limit)
    .map((item) => item.question);
}

export function normalizeQuestionOptions(options: unknown) {
  if (!Array.isArray(options)) {
    return [];
  }

  return options
    .map((option) => {
      if (!option || typeof option !== "object" || Array.isArray(option)) {
        return null;
      }
      const value = option as { key?: unknown; text?: unknown };
      return {
        key: String(value.key || "").trim(),
        text: String(value.text || "").trim()
      };
    })
    .filter((option): option is { key: string; text: string } => Boolean(option?.key || option?.text));
}
