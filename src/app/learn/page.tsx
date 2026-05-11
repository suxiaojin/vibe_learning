import Link from "next/link";
import { Lock, Sparkles, Trophy } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { ensureInitialProgress } from "@/lib/learning";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";

export default async function LearnPage() {
  const user = await requireUser();
  await ensureInitialProgress(user.id);

  const points = await prisma.knowledgePoint.findMany({
    where: { status: "published", chapter: { status: "published" } },
    include: {
      chapter: true,
      progress: { where: { userId: user.id } },
      _count: { select: { questions: true } }
    },
    orderBy: [{ chapter: { sortOrder: "asc" } }, { sortOrder: "asc" }]
  });

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <section className="rounded-3xl bg-ink p-6 text-white shadow-soft">
        <p className="text-sm font-semibold text-honey">江苏专转本 · 计算机</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">今日闯关路线</h1>
            <p className="mt-2 max-w-2xl text-slate-300">先看知识点，再做题。每关通过后，下一关自动解锁。</p>
          </div>
          <Link className="primary-button bg-coral hover:bg-coral/90" href="/wrong-book">查看错题</Link>
        </div>
      </section>
      <section className="mt-8 grid gap-4 md:grid-cols-2">
        {points.map((point, index) => {
          const status = point.progress[0]?.status || (index === 0 ? "unlocked" : "locked");
          const locked = status === "locked";
          return (
            <Link
              key={point.id}
              href={locked ? "/learn" : `/learn/${point.id}`}
              className={cn("panel relative overflow-hidden transition", !locked && "hover:-translate-y-0.5 hover:border-teal")}
            >
              <div className="flex items-start gap-4">
                <div className={cn("grid size-12 shrink-0 place-items-center rounded-2xl", status === "passed" ? "bg-honey text-ink" : locked ? "bg-slate-100 text-slate-400" : "bg-teal text-white")}>
                  {locked ? <Lock size={22} /> : status === "passed" ? <Trophy size={22} /> : <Sparkles size={22} />}
                </div>
                <div>
                  <p className="text-sm text-slate-500">{point.chapter.title} · {point._count.questions} 题</p>
                  <h2 className="mt-1 text-xl font-bold">{point.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{point.summary}</p>
                  <span className={cn("badge mt-4", locked ? "bg-slate-100 text-slate-500" : status === "passed" ? "bg-honey/30 text-amber-800" : "bg-teal/10 text-teal")}>
                    {locked ? "未解锁" : status === "passed" ? "已通过" : "可挑战"}
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </section>
    </main>
  );
}
