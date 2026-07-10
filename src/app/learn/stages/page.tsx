import Link from "next/link";
import { ArrowLeft, Lock, RotateCcw, Sparkles, Trophy } from "lucide-react";
import { StudentPageShell } from "@/components/student-page-shell";
import { requireUser } from "@/lib/auth";
import { getStudentLearningPath, type SyllabusPathGroup } from "@/lib/syllabus-learning";

const text = {
  back: "\u8fd4\u56de",
  current: "\u7ee7\u7eed",
  review: "\u590d\u4e60",
  locked: "\u672a\u89e3\u9501",
  course: "\u8bfe\u7a0b",
  pieces: "\u4e2a\u8282",
  progress: "\u5b66\u4e60\u8fdb\u5ea6",
  empty: "\u5f53\u524d\u6ca1\u6709\u5df2\u53d1\u5e03\u7684\u95ef\u5173\u5185\u5bb9\u3002"
};

function getCurrentChapterId(group: SyllabusPathGroup | null) {
  if (!group) {
    return null;
  }

  for (const course of group.courses) {
    const chapter = course.chapters.find((item) => item.sections.some((section) => section.status === "unlocked"));
    if (chapter) {
      return chapter.id;
    }
  }

  for (const course of group.courses) {
    const chapter = course.chapters.find((item) => item.sections.some((section) => section.status !== "passed"));
    if (chapter) {
      return chapter.id;
    }
  }

  return group.courses.flatMap((course) => course.chapters).at(-1)?.id || null;
}

export default async function StagesPage({
  searchParams
}: {
  searchParams?: Promise<{ course?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const pathState = await getStudentLearningPath(user.id, params?.course);
  const group = pathState.selectedGroup;
  const currentChapterId = getCurrentChapterId(group);

  return (
    <StudentPageShell active="learn" maxWidthClassName="max-w-3xl">
      <Link className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-teal" href={group ? `/learn?course=${group.key}` : "/learn"}>
        <ArrowLeft size={22} />
        {text.back}
      </Link>

      <div className="mt-5 border-t border-border-soft pt-4">
        {!group || group.sectionIds.length === 0 ? <div className="panel text-slate-600">{text.empty}</div> : null}
        <div className="space-y-5">
          {group?.courses.map((course) => (
            <section key={course.id} className="space-y-3">
              <div className="px-1">
                <p className="text-xs font-semibold text-teal">{text.course}</p>
                <h1 className="mt-1 text-2xl font-semibold text-ink">{course.title}</h1>
              </div>
              {course.chapters.map((chapter) => {
                const passedCount = chapter.sections.filter((section) => section.status === "passed").length;
                const percent = chapter.sections.length ? Math.round((passedCount / chapter.sections.length) * 100) : 0;
                const completed = chapter.sections.length > 0 && passedCount === chapter.sections.length;
                const current = currentChapterId === chapter.id && !completed;
                const locked = !completed && !current && chapter.sections.every((section) => section.status === "locked");

                return (
                  <section
                    key={chapter.id}
                    className={`overflow-hidden rounded-panel border border-border-soft/80 shadow-card ${current ? "bg-success-muted" : completed ? "bg-surface" : "bg-surface-muted"}`}
                  >
                    <div className="p-5">
                      <div>
                        <h2 className="text-xl font-semibold text-ink">{chapter.title}</h2>
                        <p className="mt-1 text-sm font-semibold text-slate-500">{chapter.sections.length} {text.pieces}</p>
                        <div className="mt-5 flex items-center gap-3">
                          {locked ? <Lock className="shrink-0 text-slate-400" size={18} /> : <span className="grid size-6 shrink-0 place-items-center rounded-full bg-success text-white">{completed ? <Trophy size={16} /> : <Sparkles size={16} />}</span>}
                          <div className="h-3 flex-1 rounded-full bg-slate-100">
                            <div className="h-3 rounded-full bg-success" style={{ width: `${percent}%` }} />
                          </div>
                          <span className="w-10 text-right text-xs font-semibold text-slate-400">{percent}%</span>
                        </div>
                        <div className="mt-7">
                          {completed ? (
                            <Link className="secondary-button w-48" href={`/learn?course=${group.key}&chapter=${chapter.id}`}>
                              <RotateCcw size={18} />
                              {text.review}
                            </Link>
                          ) : current ? (
                            <Link className="success-button w-64" href={`/learn?course=${group.key}&chapter=${chapter.id}`}>{text.current}</Link>
                          ) : (
                            <button className="secondary-button w-64 text-slate-400" type="button" disabled>{text.locked}</button>
                          )}
                        </div>
                      </div>
                    </div>
                  </section>
                );
              })}
            </section>
          ))}
        </div>
      </div>
    </StudentPageShell>
  );
}
