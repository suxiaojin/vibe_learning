import { QuestionBankDetailWorkbench } from "@/components/question-bank-detail-workbench";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
              }
            }
          }
        },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
      }
    }
  });

  return (
    <QuestionBankDetailWorkbench
      paperId={paper.id}
      paperTitle={paper.title}
      ownerHref={ownerHref(paper)}
      isComputerMajor={Boolean(paper.course.major?.name.includes("计算机") || paper.title.includes("计算机"))}
      questions={paper.questions.map((item) => ({
        id: item.id,
        title: item.question.stem,
        type: item.question.type,
        status: item.question.status,
        difficulty: item.question.difficulty,
        options: toQuestionOptions(item.question.options),
        answer: toAnswerList(item.question.answer),
        analysis: item.question.analysis,
        knowledgePointTitle: item.question.knowledgePoint.title,
        chapterTitle: item.question.knowledgePoint.chapter.title
      }))}
    />
  );
}
