import Link from "next/link";
import { ArrowLeft, Trophy } from "lucide-react";
import { redirect } from "next/navigation";
import { QuizRunner } from "@/components/quiz-runner";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function PointPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const point = await prisma.knowledgePoint.findUnique({
    where: { id: id },
    include: {
      chapter: true,
      questions: {
        where: { status: "published" },
        orderBy: { createdAt: "asc" },
        select: { id: true, type: true, stem: true, options: true, answer: true, source: true }
      },
      progress: { where: { userId: user.id } }
    }
  });

  if (!point || point.status !== "published") {
    redirect("/learn");
  }
  const status = point.progress[0]?.status;
  if (status === "locked") {
    redirect("/learn");
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <Link className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 transition hover:text-teal" href="/learn">
        <ArrowLeft size={18} />
        返回学习路线
      </Link>

      <section className="mt-5 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-soft">
        <div className="bg-[#58cc02] p-6 text-white">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-black text-white/80">第 {point.chapter.sortOrder} 部分 / {point.chapter.title}</p>
              <h1 className="mt-2 text-3xl font-black">{point.title}</h1>
              <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-white/90">{point.summary}</p>
            </div>
            <span className="grid size-16 place-items-center rounded-2xl border-2 border-white/20 bg-white/15">
              <Trophy size={32} />
            </span>
          </div>
        </div>

        <div className="p-5">
          <div className="rounded-2xl bg-mist p-5">
            <p className="text-sm font-black text-teal">课前提示</p>
            <div className="mt-3 whitespace-pre-wrap text-base leading-8 text-slate-700">{point.content}</div>
          </div>
        </div>
      </section>

      <section className="mt-8">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-black text-teal">开始闯关</p>
            <h2 className="mt-1 text-2xl font-black text-ink">完成本关练习</h2>
          </div>
          <span className="badge bg-honey/20 text-amber-700">{point.questions.length} 题</span>
        </div>
        <QuizRunner pointId={point.id} questions={point.questions} />
      </section>
    </main>
  );
}
