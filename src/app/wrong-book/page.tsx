import { CheckCircle2 } from "lucide-react";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function markMastered(formData: FormData) {
  "use server";
  const user = await requireUser();
  await prisma.wrongQuestion.update({
    where: { userId_questionId: { userId: user.id, questionId: String(formData.get("questionId")) } },
    data: { status: "mastered" }
  });
  revalidatePath("/wrong-book");
}

export default async function WrongBookPage() {
  const user = await requireUser();
  const wrongQuestions = await prisma.wrongQuestion.findMany({
    where: { userId: user.id, status: "active" },
    include: { question: { include: { knowledgePoint: true } } },
    orderBy: { lastWrongAt: "desc" }
  });

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-coral">错题本</p>
          <h1 className="mt-1 text-3xl font-bold">把薄弱点捞出来</h1>
        </div>
        <span className="badge bg-coral/10 text-coral">{wrongQuestions.length} 道待掌握</span>
      </div>
      <section className="mt-6 space-y-4">
        {wrongQuestions.length === 0 ? (
          <div className="panel text-slate-600">当前没有待掌握错题。</div>
        ) : (
          wrongQuestions.map((item) => (
            <article key={item.id} className="panel">
              <p className="text-sm text-slate-500">{item.question.knowledgePoint.title} · 错 {item.wrongCount} 次</p>
              <h2 className="mt-2 font-bold leading-7">{item.question.stem}</h2>
              <p className="mt-3 rounded-2xl bg-mist p-4 text-sm leading-6 text-slate-700">{item.question.analysis}</p>
              <form action={markMastered} className="mt-4">
                <input type="hidden" name="questionId" value={item.questionId} />
                <button className="secondary-button" type="submit">
                  <CheckCircle2 size={18} />
                  标记已掌握
                </button>
              </form>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
