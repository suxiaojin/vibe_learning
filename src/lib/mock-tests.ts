import { prisma } from "@/lib/prisma";
import { isAiGeneratedQuestionBankTitle } from "@/lib/question-bank-source";
import { getStudentLearningPath, type LearningOwnerType, type SyllabusPathGroup, type SyllabusPathSection } from "@/lib/syllabus-learning";

export type MockTestQuestion = {
  id: string;
  type: string;
  stem: string;
  options: unknown;
  difficulty: string;
  source: string;
  sourceYear: number | null;
  questionBank: {
    id: string;
    title: string;
    year: number | null;
    paperType: string;
  };
};

export type MockTestSection = SyllabusPathSection & {
  chapterTitle: string;
  courseTitle: string;
};

export type MockTestContext = {
  group: SyllabusPathGroup | null;
  courseKey: LearningOwnerType;
  passedSections: MockTestSection[];
};

export function normalizeMockTestCourseKey(value?: string | null): LearningOwnerType {
  return value === "public_subject" ? "public_subject" : "major";
}

export async function getMockTestContext(userId: string, courseKey: LearningOwnerType): Promise<MockTestContext> {
  const learningPath = await getStudentLearningPath(userId, courseKey);
  const group = learningPath.groups.find((item) => item.key === courseKey) || null;
  const passedSections = group
    ? group.courses.flatMap((course) =>
        course.chapters.flatMap((chapter) =>
          chapter.sections
            .filter((section) => section.status === "passed")
            .map((section) => ({
              ...section,
              chapterTitle: chapter.title,
              courseTitle: course.title
            }))
        )
      )
    : [];

  return {
    group,
    courseKey,
    passedSections
  };
}

export async function getAiGeneratedQuestionsForSections(group: SyllabusPathGroup, sections: MockTestSection[]) {
  const courseIds = group.courses.map((course) => course.id);
  const syllabusItemIds = uniqueValues(sections.flatMap((section) => section.questionSyllabusItemIds));

  if (courseIds.length === 0 || syllabusItemIds.length === 0) {
    return [];
  }

  const tags = await prisma.questionKnowledgeTag.findMany({
    where: {
      syllabusItemId: { in: syllabusItemIds },
      question: { status: "published" }
    },
    select: {
      question: {
        select: {
          id: true,
          type: true,
          stem: true,
          options: true,
          difficulty: true,
          source: true,
          sourceYear: true,
          createdAt: true,
          paperQuestions: {
            where: {
              paper: {
                courseId: { in: courseIds },
                status: "published"
              }
            },
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
            orderBy: { sortOrder: "asc" }
          }
        }
      }
    }
  });

  const byQuestionId = new Map<string, MockTestQuestion & { createdAt: Date; sortOrder: number }>();

  for (const tag of tags) {
    const aiPaperQuestions = tag.question.paperQuestions
      .filter((paperQuestion) => isAiGeneratedQuestionBankTitle(paperQuestion.paper.title))
      .sort((left, right) => left.paper.sortOrder - right.paper.sortOrder || left.sortOrder - right.sortOrder);
    const firstPaperQuestion = aiPaperQuestions[0];

    if (!firstPaperQuestion || byQuestionId.has(tag.question.id)) {
      continue;
    }

    byQuestionId.set(tag.question.id, {
      id: tag.question.id,
      type: tag.question.type,
      stem: tag.question.stem,
      options: tag.question.options,
      difficulty: tag.question.difficulty,
      source: tag.question.source,
      sourceYear: tag.question.sourceYear,
      createdAt: tag.question.createdAt,
      sortOrder: firstPaperQuestion.sortOrder,
      questionBank: {
        id: firstPaperQuestion.paper.id,
        title: firstPaperQuestion.paper.title,
        year: firstPaperQuestion.paper.year,
        paperType: firstPaperQuestion.paper.paperType
      }
    });
  }

  return Array.from(byQuestionId.values())
    .sort((left, right) => left.sortOrder - right.sortOrder || left.createdAt.getTime() - right.createdAt.getTime())
    .map(({ createdAt: _createdAt, sortOrder: _sortOrder, ...question }) => question);
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
      if (!option || typeof option !== "object") {
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

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}
