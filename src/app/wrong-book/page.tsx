import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { StudentSidebar } from "@/components/student-sidebar";
import { WrongBookWorkbench, type WrongBookGroupView } from "@/components/wrong-book-workbench";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Option = {
  key: string;
  text: string;
};

type SyllabusWithParents = {
  id: string;
  title: string;
  course: {
    id: string;
    name: string;
  };
  parent: SyllabusWithParents | null;
};

type WrongQuestionItem = Awaited<ReturnType<typeof getWrongQuestions>>[number];

async function markMastered(formData: FormData) {
  "use server";
  const user = await requireUser();
  await prisma.wrongQuestion.update({
    where: { userId_questionId: { userId: user.id, questionId: String(formData.get("questionId")) } },
    data: { status: "mastered" }
  });
  revalidatePath("/wrong-book");
}

async function getWrongQuestions(userId: string) {
  return prisma.wrongQuestion.findMany({
    where: { userId, status: "active" },
    include: {
      question: {
        include: {
          syllabusItem: {
            include: {
              course: { select: { id: true, name: true } },
              parent: {
                include: {
                  course: { select: { id: true, name: true } },
                  parent: {
                    include: {
                      course: { select: { id: true, name: true } },
                      parent: {
                        include: {
                          course: { select: { id: true, name: true } }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          knowledgeTags: {
            include: {
              syllabusItem: {
                include: {
                  course: { select: { id: true, name: true } },
                  parent: {
                    include: {
                      course: { select: { id: true, name: true } },
                      parent: {
                        include: {
                          course: { select: { id: true, name: true } },
                          parent: {
                            include: {
                              course: { select: { id: true, name: true } }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            },
            orderBy: [{ source: "desc" }, { createdAt: "asc" }]
          },
          paperQuestions: {
            include: {
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
          },
          knowledgePoint: {
            include: {
              chapter: true,
              syllabusItem: {
                include: {
                  course: { select: { id: true, name: true } },
                  parent: {
                    include: {
                      course: { select: { id: true, name: true } },
                      parent: {
                        include: {
                          course: { select: { id: true, name: true } },
                          parent: {
                            include: {
                              course: { select: { id: true, name: true } }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    orderBy: [{ lastWrongAt: "desc" }, { wrongCount: "desc" }]
  });
}

function coerceOptions(options: Prisma.JsonValue): Option[] {
  if (!Array.isArray(options)) {
    return [];
  }

  return options
    .map((item) => {
      if (typeof item === "object" && item && "key" in item && "text" in item) {
        return { key: String(item.key), text: String(item.text) };
      }
      return null;
    })
    .filter(Boolean) as Option[];
}

function answerText(answer: Prisma.JsonValue) {
  return Array.isArray(answer) ? answer.map(String).join("、") : String(answer || "");
}

function formatDate(date: Date) {
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Shanghai"
  });
}

function syllabusPath(item: SyllabusWithParents | null) {
  if (!item) {
    return null;
  }

  const ancestors: SyllabusWithParents[] = [];
  let cursor: SyllabusWithParents | null = item;
  let guard = 0;

  while (cursor && guard < 8) {
    ancestors.unshift(cursor);
    cursor = cursor.parent;
    guard += 1;
  }

  const chapter = ancestors[0] || item;
  const section = ancestors[1] || item;

  return {
    courseId: chapter.course.id,
    courseTitle: chapter.course.name,
    chapterId: chapter.id,
    chapterTitle: chapter.title,
    sectionId: section.id,
    sectionTitle: section.title
  };
}

function questionPath(item: WrongQuestionItem) {
  const syllabusItem = item.question.knowledgeTags[0]?.syllabusItem || item.question.syllabusItem || item.question.knowledgePoint.syllabusItem;
  const path = syllabusPath(syllabusItem as SyllabusWithParents | null);
  if (path) {
    return { ...path, practiceHref: `/learn/${path.sectionId}` };
  }

  const point = item.question.knowledgePoint;
  return {
    courseId: "legacy",
    courseTitle: "旧版知识点",
    chapterId: point.chapter.id,
    chapterTitle: point.chapter.title,
    sectionId: point.id,
    sectionTitle: point.title,
    practiceHref: "/learn"
  };
}

function questionBankTitle(item: WrongQuestionItem) {
  return item.question.paperQuestions[0]?.paper.title || item.question.source || "未关联题库";
}

function groupWrongQuestions(items: WrongQuestionItem[]) {
  const groups = new Map<
    string,
    {
      key: string;
      courseTitle: string;
      chapterTitle: string;
      sectionTitle: string;
      sectionId: string;
      practiceHref: string;
      items: WrongQuestionItem[];
    }
  >();

  for (const item of items) {
    const path = questionPath(item);
    const key = `${path.courseId}:${path.chapterId}:${path.sectionId}`;
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(item);
    } else {
      groups.set(key, {
        key,
        courseTitle: path.courseTitle,
        chapterTitle: path.chapterTitle,
        sectionTitle: path.sectionTitle,
        sectionId: path.sectionId,
        practiceHref: path.practiceHref,
        items: [item]
      });
    }
  }

  return Array.from(groups.values());
}

function needsContentReview(answer: string) {
  return /数据缺失|无法给出准确答案|需补充/.test(answer);
}

function toWrongBookGroups(groups: ReturnType<typeof groupWrongQuestions>): WrongBookGroupView[] {
  return groups.map((group) => ({
    key: group.key,
    courseTitle: group.courseTitle,
    chapterTitle: group.chapterTitle,
    sectionTitle: group.sectionTitle,
    practiceHref: group.practiceHref,
    items: group.items.map((item) => {
      const normalizedAnswer = answerText(item.question.answer);
      return {
        id: item.id,
        questionId: item.questionId,
        stem: item.question.stem,
        options: coerceOptions(item.question.options),
        answerText: normalizedAnswer,
        analysis: item.question.analysis,
        wrongCount: item.wrongCount,
        lastWrongAt: item.lastWrongAt.toISOString(),
        lastWrongLabel: formatDate(item.lastWrongAt),
        sourceTitle: questionBankTitle(item),
        needsContentReview: needsContentReview(normalizedAnswer)
      };
    })
  }));
}

export default async function WrongBookPage() {
  const user = await requireUser();
  const wrongQuestions = await getWrongQuestions(user.id);
  const groups = groupWrongQuestions(wrongQuestions);
  const repeatedCount = wrongQuestions.filter((item) => item.wrongCount > 1).length;
  const workbenchGroups = toWrongBookGroups(groups);

  return (
    <main className="min-h-dvh bg-mist lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
      <StudentSidebar active="wrong-book" />
      <WrongBookWorkbench groups={workbenchGroups} markMasteredAction={markMastered} repeatedCount={repeatedCount} totalCount={wrongQuestions.length} />
    </main>
  );
}
