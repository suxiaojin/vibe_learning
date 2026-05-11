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
        select: { id: true, type: true, stem: true, options: true, source: true }
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
    <main className="mx-auto max-w-4xl px-4 py-8">
      <section className="panel">
        <p className="text-sm font-semibold text-teal">{point.chapter.title} · 预计 {point.estimatedMinutes} 分钟</p>
        <h1 className="mt-2 text-3xl font-bold">{point.title}</h1>
        <p className="mt-3 text-lg text-slate-700">{point.summary}</p>
        <div className="prose prose-slate mt-5 max-w-none whitespace-pre-wrap leading-8 text-slate-700">{point.content}</div>
      </section>
      <QuizRunner pointId={point.id} questions={point.questions} />
    </main>
  );
}
