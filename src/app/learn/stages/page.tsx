import Link from "next/link";
import { ArrowLeft, Lock, RotateCcw, Sparkles, Trophy } from "lucide-react";
import { StudentSidebar } from "@/components/student-sidebar";
import { requireUser } from "@/lib/auth";
import { ensureInitialProgress, repairUnlockedProgress } from "@/lib/learning";
import { prisma } from "@/lib/prisma";

type ChapterWithPoints = Awaited<ReturnType<typeof getChapters>>[number];
type PointStatus = "locked" | "unlocked" | "passed";

const text = {
  back: "\u8fd4\u56de",
  current: "\u7ee7\u7eed",
  review: "\u590d\u4e60",
  locked: "\u672a\u89e3\u9501",
  part: "\u7b2c",
  section: "\u90e8\u5206",
  pieces: "\u4e2a\u8282",
  progress: "\u5b66\u4e60\u8fdb\u5ea6",
  empty: "\u5f53\u524d\u6ca1\u6709\u5df2\u53d1\u5e03\u7684\u7ae0\u8282\u3002",
  currentSpeech: "\u7ee7\u7eed\u5b66\u5b8c\u8fd9\u4e00\u7ae0\u5427\u3002",
  lockedSpeech: "\u5b8c\u6210\u524d\u9762\u7684\u7ae0\u540e\u89e3\u9501\u3002"
};

async function getChapters(userId: string) {
  return prisma.chapter.findMany({
    where: { status: "published" },
    include: {
      points: {
        where: { status: "published" },
        include: {
          progress: { where: { userId } }
        },
        orderBy: { sortOrder: "asc" }
      }
    },
    orderBy: { sortOrder: "asc" }
  });
}

function pointStatus(point: ChapterWithPoints["points"][number], globalIndex: number): PointStatus {
  return point.progress[0]?.status || (globalIndex === 0 ? "unlocked" : "locked");
}

export default async function StagesPage() {
  const user = await requireUser();
  await ensureInitialProgress(user.id);
  await repairUnlockedProgress(user.id);

  const chapters = await getChapters(user.id);
  const allPoints = chapters.flatMap((chapter) => chapter.points);
  const firstCurrentChapter =
    chapters.find((chapter) => chapter.points.some((point) => pointStatus(point, allPoints.findIndex((item) => item.id === point.id)) !== "passed")) || chapters.at(-1);

  return (
    <main className="min-h-dvh bg-white lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      <StudentSidebar active="learn" />

      <section className="mx-auto w-full max-w-3xl px-5 py-8">
        <Link className="inline-flex items-center gap-2 text-lg font-black text-slate-400 transition hover:text-slate-600" href="/learn">
          <ArrowLeft size={22} />
          {text.back}
        </Link>

        <div className="mt-5 border-t border-slate-200 pt-4">
          {chapters.length === 0 ? <div className="panel text-slate-600">{text.empty}</div> : null}
          <div className="space-y-4">
            {chapters.map((chapter) => {
              const statuses = chapter.points.map((point) => pointStatus(point, allPoints.findIndex((item) => item.id === point.id)));
              const passedCount = statuses.filter((status) => status === "passed").length;
              const percent = chapter.points.length ? Math.round((passedCount / chapter.points.length) * 100) : 0;
              const completed = chapter.points.length > 0 && passedCount === chapter.points.length;
              const current = firstCurrentChapter?.id === chapter.id && !completed;
              const locked = !completed && !current && statuses.every((status) => status === "locked");

              return (
                <section key={chapter.id} className={`overflow-hidden rounded-2xl border border-slate-200 ${current ? "bg-sky-100" : completed ? "bg-white" : "bg-slate-50"}`}>
                  <div className="grid gap-4 p-5 md:grid-cols-[1fr_240px]">
                    <div>
                      <h2 className="text-2xl font-black text-ink">{text.part} {chapter.sortOrder} {text.section} <span className="ml-3">{chapter.title}</span></h2>
                      <div className="mt-5 flex items-center gap-3">
                        {locked ? <Lock className="shrink-0 text-slate-400" size={18} /> : <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#58cc02] text-white"><Trophy size={16} /></span>}
                        <div className="h-3 flex-1 rounded-full bg-slate-100">
                          <div className="h-3 rounded-full bg-[#58cc02]" style={{ width: `${percent}%` }} />
                        </div>
                        <span className="w-10 text-right text-xs font-black text-slate-400">{percent}%</span>
                      </div>
                      <div className="mt-7">
                        {completed ? (
                          <Link className="secondary-button w-48" href={`/learn?chapter=${chapter.id}`}>
                            <RotateCcw size={18} />
                            {text.review}
                          </Link>
                        ) : current ? (
                          <Link className="primary-button w-64 bg-sky-500 hover:bg-sky-500/90" href="/learn">{text.current}</Link>
                        ) : (
                          <button className="secondary-button w-64 text-sky-500" type="button" disabled>{text.part} {chapter.sortOrder} {text.section}</button>
                        )}
                      </div>
                    </div>

                    <div className="hidden min-h-40 items-center justify-center md:flex">
                      <div className="rounded-2xl bg-white p-5 text-base font-semibold leading-7 text-slate-700 shadow-sm">
                        {current ? text.currentSpeech : locked ? text.lockedSpeech : chapter.title}
                      </div>
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}
