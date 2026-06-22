import { BookOpenCheck, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { StudentSidebar } from "@/components/student-sidebar";
import { WrongQuestionAi } from "@/components/wrong-question-ai";
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

export default async function WrongBookPage() {
  const user = await requireUser();
  const wrongQuestions = await getWrongQuestions(user.id);
  const groups = groupWrongQuestions(wrongQuestions);

  return (
    <main className="min-h-dvh bg-mist lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
      <StudentSidebar active="wrong-book" />

      <section className="mx-auto w-full max-w-5xl px-5 py-8 lg:px-8">
        <section className="rounded-[22px] border border-slate-200/80 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-teal">错题本</p>
              <h1 className="mt-1 text-[32px] font-bold leading-tight text-ink">按课程、章和节复习错题</h1>
              <p className="mt-2 text-sm font-medium leading-6 text-slate-500">先看正确答案和解析，再用 AI 把卡住的点讲透。</p>
            </div>
            <span className="badge bg-coral/10 text-coral">{wrongQuestions.length} 道待掌握</span>
          </div>
        </section>

        <section className="mt-6 space-y-6">
          {groups.length === 0 ? (
            <div className="panel text-slate-600">当前没有待掌握错题。</div>
          ) : (
            groups.map((group) => (
              <section key={group.key} className="panel">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex gap-3">
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-teal/10 text-teal">
                      <BookOpenCheck size={22} />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-teal">{group.courseTitle} / {group.chapterTitle}</p>
                      <h2 className="mt-1 text-xl font-bold">{group.sectionTitle}</h2>
                      <p className="mt-1 text-sm text-slate-500">{group.items.length} 道错题待掌握</p>
                    </div>
                  </div>
                  <Link className="secondary-button" href={group.practiceHref}>再练一次</Link>
                </div>

                <div className="mt-5 space-y-4">
                  {group.items.map((item, index) => {
                    const options = coerceOptions(item.question.options);
                    return (
                      <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-coral">错题 {index + 1} · 错 {item.wrongCount} 次</p>
                            <h3 className="mt-2 font-bold leading-7">{item.question.stem}</h3>
                          </div>
                          <span className="badge bg-slate-100 text-slate-600">最近错题：{formatDate(item.lastWrongAt)}</span>
                        </div>
                        <p className="mt-3 inline-flex max-w-full rounded-full bg-teal/10 px-3 py-1 text-xs font-semibold text-teal">
                          <span className="truncate">题库：{questionBankTitle(item)}</span>
                        </p>

                        <div className="mt-4 grid gap-2">
                          {options.map((option) => (
                            <div key={option.key} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6">
                              <span className="font-semibold">{option.key}.</span> {option.text}
                            </div>
                          ))}
                        </div>

                        <div className="mt-4 rounded-2xl bg-teal/10 p-4 text-sm text-teal">
                          <span className="font-semibold">正确答案：</span>{answerText(item.question.answer)}
                        </div>
                        <div className="mt-3 rounded-2xl bg-mist p-4">
                          <p className="text-xs font-semibold text-slate-500">解析</p>
                          <p className="mt-2 text-sm leading-6 text-slate-700">{item.question.analysis}</p>
                        </div>

                        <div className="mt-4 flex flex-wrap items-center gap-3">
                          <form action={markMastered}>
                            <input type="hidden" name="questionId" value={item.questionId} />
                            <button className="secondary-button" type="submit">
                              <CheckCircle2 size={18} />
                              标记已掌握
                            </button>
                          </form>
                          <WrongQuestionAi questionId={item.questionId} />
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </section>
      </section>
    </main>
  );
}
