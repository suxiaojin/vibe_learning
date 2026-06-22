import Link from "next/link";
import { ArrowLeft, BookOpenCheck, Play } from "lucide-react";
import { redirect } from "next/navigation";
import { StudentSidebar } from "@/components/student-sidebar";
import { requireUser } from "@/lib/auth";
import { getSyllabusSectionForStudent } from "@/lib/syllabus-learning";

const text = {
  back: "\u8fd4\u56de",
  guide: "\u6307\u5357",
  important: "\u91cd\u70b9\u5185\u5bb9",
  start: "\u5f00\u59cb\u7ec3\u4e60"
};

export default async function GuidePage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const access = await getSyllabusSectionForStudent(user.id, id);

  if (!access || access.locked) {
    redirect("/learn");
  }

  const guideContent = access.section.description || `本节围绕「${access.section.title}」进行练习，完成本节题目并达到 80 分即可进入下一关。`;

  return (
    <main className="min-h-dvh bg-mist lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
      <StudentSidebar active="learn" />

      <section className="mx-auto w-full max-w-3xl px-5 py-8">
        <Link className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-teal" href={`/learn?course=${access.group.key}&chapter=${access.chapter.id}`}>
          <ArrowLeft size={22} />
          {text.back}
        </Link>

        <section className="mt-5 rounded-[22px] border border-slate-200/80 bg-white p-7 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
          <div className="flex flex-wrap items-center gap-6">
            <span className="grid size-24 place-items-center rounded-full bg-[#58cc02]/15 text-[#58cc02]">
              <BookOpenCheck size={44} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-teal">{access.course.title} / {access.chapter.title} / {text.guide}</p>
              <h1 className="mt-2 break-words text-[32px] font-bold leading-tight text-ink">{access.section.title}</h1>
              <p className="mt-2 text-base font-medium leading-7 text-slate-500">{access.section.questionCount} 道题</p>
            </div>
          </div>

          <div className="mt-8 border-t border-slate-200 pt-7">
            <p className="text-sm font-semibold text-teal">{text.important}</p>
            <div className="mt-4 whitespace-pre-wrap text-base font-medium leading-8 text-slate-700">{guideContent}</div>
          </div>

          <div className="mt-8">
            <Link className="primary-button w-52 bg-[#58cc02] hover:bg-[#58cc02]/90" href={`/learn/${access.section.id}`}>
              <Play size={18} />
              {text.start}
            </Link>
          </div>
        </section>
      </section>
    </main>
  );
}
