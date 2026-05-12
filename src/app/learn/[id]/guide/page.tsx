import Link from "next/link";
import { ArrowLeft, BookOpenCheck, Play } from "lucide-react";
import { redirect } from "next/navigation";
import { StudentSidebar } from "@/components/student-sidebar";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const text = {
  back: "\u8fd4\u56de",
  guide: "\u6307\u5357",
  important: "\u91cd\u70b9\u5185\u5bb9",
  start: "\u5f00\u59cb\u7ec3\u4e60",
  part: "\u7b2c",
  section: "\u90e8\u5206"
};

export default async function GuidePage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireUser();

  const point = await prisma.knowledgePoint.findUnique({
    where: { id },
    include: { chapter: true }
  });

  if (!point || point.status !== "published" || point.chapter.status !== "published") {
    redirect("/learn");
  }

  return (
    <main className="min-h-dvh bg-white lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      <StudentSidebar active="learn" />

      <section className="mx-auto w-full max-w-3xl px-5 py-8">
        <Link className="inline-flex items-center gap-2 text-lg font-black text-slate-400 transition hover:text-slate-600" href="/learn">
          <ArrowLeft size={22} />
          {text.back}
        </Link>

        <section className="mt-5 border-t border-slate-200 pt-8">
          <div className="flex flex-wrap items-center gap-6">
            <span className="grid size-24 place-items-center rounded-full bg-[#58cc02]/15 text-[#58cc02]">
              <BookOpenCheck size={44} />
            </span>
            <div>
              <p className="text-sm font-black text-sky-500">{text.part} {point.chapter.sortOrder} {text.section} {text.guide}</p>
              <h1 className="mt-2 text-3xl font-black text-ink">{point.title}</h1>
              <p className="mt-2 text-base font-semibold leading-7 text-slate-500">{point.summary}</p>
            </div>
          </div>

          <div className="mt-8 border-t border-slate-200 pt-7">
            <p className="text-sm font-black text-sky-500">{text.important}</p>
            <div className="mt-4 whitespace-pre-wrap text-base font-semibold leading-8 text-slate-700">{point.content}</div>
          </div>

          <div className="mt-8">
            <Link className="primary-button w-52 bg-[#58cc02] hover:bg-[#58cc02]/90" href={`/learn/${point.id}`}>
              <Play size={18} />
              {text.start}
            </Link>
          </div>
        </section>
      </section>
    </main>
  );
}
