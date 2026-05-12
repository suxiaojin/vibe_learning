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
          knowledgePoint: {
            include: {
              chapter: true
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

function groupWrongQuestions(items: WrongQuestionItem[]) {
  const groups = new Map<string, { chapterTitle: string; pointTitle: string; pointId: string; items: WrongQuestionItem[] }>();

  for (const item of items) {
    const point = item.question.knowledgePoint;
    const key = point.id;
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(item);
    } else {
      groups.set(key, {
        chapterTitle: point.chapter.title,
        pointTitle: point.title,
        pointId: point.id,
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
    <main className="min-h-dvh bg-mist lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      <StudentSidebar active="wrong-book" />

      <section className="mx-auto w-full max-w-5xl px-5 py-8 lg:px-8">
      <section className="rounded-3xl bg-ink p-6 text-white shadow-soft">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-honey">错题本</p>
            <h1 className="mt-1 text-3xl font-bold">按章节和知识点复习错题</h1>
            <p className="mt-2 text-slate-300">先看正确答案和解析，再用 AI 把卡住的点讲透。</p>
          </div>
          <span className="badge bg-coral text-white">{wrongQuestions.length} 道待掌握</span>
        </div>
      </section>

      <section className="mt-6 space-y-6">
        {groups.length === 0 ? (
          <div className="panel text-slate-600">当前没有待掌握错题。</div>
        ) : (
          groups.map((group) => (
            <section key={group.pointId} className="panel">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-teal/10 text-teal">
                    <BookOpenCheck size={22} />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-teal">{group.chapterTitle}</p>
                    <h2 className="mt-1 text-xl font-bold">{group.pointTitle}</h2>
                    <p className="mt-1 text-sm text-slate-500">{group.items.length} 道错题待掌握</p>
                  </div>
                </div>
                <Link className="secondary-button" href={`/learn/${group.pointId}`}>再练一次</Link>
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

