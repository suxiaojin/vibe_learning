import Link from "next/link";
import { ArrowLeft, BookOpenCheck, Play } from "lucide-react";
import { redirect } from "next/navigation";
import { StudentPageShell } from "@/components/student-page-shell";
import { requireUser } from "@/lib/auth";
import { getLearningPathThemeStyle } from "@/lib/learning-path-theme";
import { getSyllabusSectionForStudent } from "@/lib/syllabus-learning";
import { getSystemSettings } from "@/lib/system-settings";

export const dynamic = "force-dynamic";

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

  const guideContent = access.chapter.description ?? "";
  const settings = await getSystemSettings();

  return (
    <StudentPageShell active="learn" maxWidthClassName="max-w-3xl">
      <div style={getLearningPathThemeStyle(settings.learningPathTheme)}>
        <Link className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-[var(--challenge-accent)]" href={`/learn/stages?course=${access.group.key}#chapter-${access.chapter.id}`}>
          <ArrowLeft size={22} />
          {text.back}
        </Link>

        <section className="mt-5 rounded-panel border border-border-soft/80 bg-surface p-7 shadow-card">
          <div className="flex flex-wrap items-center gap-6">
            <span className="grid size-24 place-items-center rounded-full bg-[var(--challenge-icon-muted)] text-[var(--challenge-primary)]">
              <BookOpenCheck size={44} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--challenge-accent)]">{access.course.title} / {access.chapter.title} / {text.guide}</p>
              <h1 className="mt-2 break-words text-3xl font-bold leading-tight text-ink">{access.section.title}</h1>
              <p className="mt-2 text-base font-medium leading-7 text-slate-500">{access.section.questionCount} 道题</p>
            </div>
          </div>

          <div className="mt-8 border-t border-border-soft pt-7">
            <p className="text-sm font-semibold text-[var(--challenge-accent)]">{text.important}</p>
            <div className="mt-4 whitespace-pre-wrap text-base font-medium leading-8 text-slate-700">{guideContent}</div>
          </div>

          <div className="mt-8">
            <Link className="success-button w-52 bg-[var(--challenge-primary)] hover:bg-[var(--challenge-strong)] focus-visible:ring-[var(--challenge-ring)]" href={`/learn/${access.section.id}`}>
              <Play size={18} />
              {text.start}
            </Link>
          </div>
        </section>
      </div>
    </StudentPageShell>
  );
}
