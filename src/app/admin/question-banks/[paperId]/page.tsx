import { QuestionBankDetailWorkbench, type KnowledgeTreeCourse } from "@/components/question-bank-detail-workbench";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseQuestionBankQuestionTypeConfig, resolveQuestionBankQuestionTypes } from "@/lib/question-bank-types";

function toQuestionOptions(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const option = item as Record<string, unknown>;
      return {
        key: String(option.key || ""),
        text: String(option.text || "")
      };
    })
    .filter((item): item is { key: string; text: string } => Boolean(item?.key));
}

function toAnswerList(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }
  if (typeof value === "string") {
    return [value];
  }
  return [];
}

function ownerHref(paper: {
  course: {
    courseType: "public_subject" | "major";
    publicSubjectId: string | null;
    majorId: string | null;
  };
}) {
  if (paper.course.courseType === "public_subject") {
    return `/admin/question-banks?type=public_subject&id=${encodeURIComponent(paper.course.publicSubjectId || "")}`;
  }
  return `/admin/question-banks?type=major&id=${encodeURIComponent(paper.course.majorId || "")}`;
}

function paperQuestionTypeText(
  paper: {
    title: string;
    course: {
      name: string;
      major: { name: string } | null;
      publicSubject: { name: string } | null;
    };
  }
) {
  return [paper.title, paper.course.name, paper.course.major?.name, paper.course.publicSubject?.name].filter(Boolean).join(" ");
}

type SyllabusItemRow = {
  id: string;
  parentId: string | null;
  title: string;
  sortOrder: number;
  code: string | null;
};

type SyllabusTreeNode = SyllabusItemRow & {
  children: SyllabusTreeNode[];
};

function sortSyllabusNodes(nodes: SyllabusTreeNode[]) {
  nodes.sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }
    const codeCompare = (left.code || "").localeCompare(right.code || "", "zh-Hans-CN", { numeric: true });
    return codeCompare || left.title.localeCompare(right.title, "zh-Hans-CN");
  });
  nodes.forEach((node) => sortSyllabusNodes(node.children));
}

function buildSyllabusTree(items: SyllabusItemRow[]) {
  const nodes = new Map<string, SyllabusTreeNode>();
  const roots: SyllabusTreeNode[] = [];

  items.forEach((item) => {
    nodes.set(item.id, { ...item, children: [] });
  });

  items.forEach((item) => {
    const node = nodes.get(item.id);
    if (!node) {
      return;
    }
    if (item.parentId && nodes.has(item.parentId)) {
      nodes.get(item.parentId)?.children.push(node);
      return;
    }
    roots.push(node);
  });

  sortSyllabusNodes(roots);
  return roots;
}

function toKnowledgeTreeCourse(course: {
  id: string;
  name: string;
  syllabusItems: SyllabusItemRow[];
}): KnowledgeTreeCourse {
  const chapters = buildSyllabusTree(course.syllabusItems).map((chapter) => ({
    id: chapter.id,
    title: chapter.title,
    sections: chapter.children.map((section) => ({
      id: section.id,
      title: section.title
    }))
  }));

  return {
    id: course.id,
    title: course.name,
    chapters
  };
}

function buildKnowledgeDisplayMap(courses: Array<{ name: string; syllabusItems: SyllabusItemRow[] }>) {
  const labels = new Map<string, { id: string; path: string }>();

  courses.forEach((course) => {
    const itemById = new Map(course.syllabusItems.map((item) => [item.id, item]));

    function ancestorsFor(item: SyllabusItemRow) {
      const ancestors = [item];
      let parentId = item.parentId;

      while (parentId) {
        const parent = itemById.get(parentId);
        if (!parent) {
          break;
        }
        ancestors.unshift(parent);
        parentId = parent.parentId;
      }

      return ancestors;
    }

    course.syllabusItems.forEach((item) => {
      const ancestors = ancestorsFor(item);
      const displayItems = ancestors.slice(0, 2);
      const displayTarget = displayItems[displayItems.length - 1] || item;
      labels.set(item.id, {
        id: displayTarget.id,
        path: [course.name, ...displayItems.map((ancestor) => ancestor.title)].join(" - ")
      });
    });
  });

  return labels;
}

export default async function QuestionBankDetailPage({
  params
}: {
  params: Promise<{ paperId: string }>;
}) {
  await requireAdmin();
  const { paperId } = await params;
  const paper = await prisma.examPaper.findUniqueOrThrow({
    where: { id: paperId },
    include: {
      course: {
        include: {
          major: true,
          publicSubject: true
        }
      },
      questions: {
        include: {
          question: {
            include: {
              knowledgePoint: {
                include: {
                  chapter: true
                }
              },
              knowledgeTags: {
                select: {
                  syllabusItemId: true
                },
                orderBy: [{ createdAt: "asc" }]
              }
            }
          }
        },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
      }
    }
  });
  const ownerCourseWhere =
    paper.course.courseType === "public_subject"
      ? { courseType: "public_subject" as const, publicSubjectId: paper.course.publicSubjectId }
      : { courseType: "major" as const, majorId: paper.course.majorId };
  const knowledgeCourses = await prisma.learningCourse.findMany({
    where: ownerCourseWhere,
    include: {
      syllabusItems: {
        select: {
          id: true,
          parentId: true,
          code: true,
          title: true,
          sortOrder: true
        },
        orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }, { code: "asc" }]
      }
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
  });
  const knowledgeDisplayById = buildKnowledgeDisplayMap(knowledgeCourses);
  const configuredQuestionTypes = parseQuestionBankQuestionTypeConfig(paper.course.questionTypeConfig);

  return (
    <QuestionBankDetailWorkbench
      courseId={paper.course.id}
      courseName={paper.course.major?.name || paper.course.publicSubject?.name || paper.course.name}
      paperId={paper.id}
      paperTitle={paper.title}
      ownerHref={ownerHref(paper)}
      questionTypes={configuredQuestionTypes || resolveQuestionBankQuestionTypes(paperQuestionTypeText(paper))}
      knowledgeTree={knowledgeCourses.map(toKnowledgeTreeCourse)}
      questions={paper.questions.map((item) => {
        const rawKnowledgeTagIds = [
          ...item.question.knowledgeTags.map((tag) => tag.syllabusItemId),
          ...(item.question.syllabusItemId ? [item.question.syllabusItemId] : [])
        ];
        const knowledgeTagLabels = [
          ...new Map(
            rawKnowledgeTagIds
              .map((id) => knowledgeDisplayById.get(id))
              .filter((item): item is { id: string; path: string } => Boolean(item))
              .map((item) => [item.id, item])
          ).values()
        ];
        const knowledgeTagIds = knowledgeTagLabels.map((item) => item.id);

        return {
          id: item.id,
          questionId: item.question.id,
          title: item.question.stem,
          type: item.question.type,
          status: item.question.status,
          difficulty: item.question.difficulty,
          options: toQuestionOptions(item.question.options),
          answer: toAnswerList(item.question.answer),
          analysis: item.question.analysis,
          aiDoubtAnswer: item.question.aiDoubtAnswer || "",
          knowledgePointTitle: item.question.knowledgePoint.title,
          chapterTitle: item.question.knowledgePoint.chapter.title,
          knowledgeTagIds,
          knowledgeTagLabels
        };
      })}
    />
  );
}
