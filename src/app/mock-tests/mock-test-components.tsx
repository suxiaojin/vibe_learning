import type { ReactNode } from "react";
import { BookOpenCheck } from "lucide-react";
import { StudentSidebar } from "@/components/student-sidebar";
import { normalizeQuestionOptions, type MockTestQuestion } from "@/lib/mock-tests";
import { cn } from "@/lib/utils";

export const questionTypeLabels: Record<string, string> = {
  single_choice: "单选题",
  multiple_choice: "多选题",
  true_false: "判断题",
  fill_blank: "填空题",
  comprehensive: "综合题"
};

export function MockTestPageFrame({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-dvh bg-mist lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
      <StudentSidebar active="course-center" />
      <section className="min-w-0 px-5 py-8 lg:px-8 xl:px-10">
        <div className="mx-auto w-full max-w-[1180px]">{children}</div>
      </section>
    </main>
  );
}

export function EmptyMockTestState({
  title,
  description
}: {
  title: string;
  description: string;
}) {
  return (
    <section className="mt-5 rounded-[22px] border border-dashed border-teal/30 bg-white px-6 py-12 text-center shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
      <BookOpenCheck className="mx-auto text-teal" size={36} />
      <h2 className="mt-4 text-xl font-semibold text-ink">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm font-medium leading-6 text-slate-500">{description}</p>
    </section>
  );
}

export function QuestionList({
  questions,
  className
}: {
  questions: MockTestQuestion[];
  className?: string;
}) {
  return (
    <section className={cn("rounded-[22px] border border-slate-200/80 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)]", className)}>
      <div className="divide-y divide-slate-100">
        {questions.map((question, index) => (
          <QuestionCard key={question.id} index={index + 1} question={question} />
        ))}
      </div>
    </section>
  );
}

function QuestionCard({ question, index }: { question: MockTestQuestion; index: number }) {
  const options = normalizeQuestionOptions(question.options);

  return (
    <article className="py-6 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-400">
        <span className="rounded-full bg-teal/10 px-3 py-1 text-teal">第{index}题</span>
        <span>{questionTypeLabels[question.type] || question.type}</span>
        <span className="min-w-0 truncate">知识点：{question.knowledgePointTitle}</span>
      </div>
      <h3 className="mt-3 text-base font-semibold leading-7 text-ink">{question.stem}</h3>
      {options.length > 0 ? (
        <div className="mt-4 grid gap-2">
          {options.map((option) => (
            <label key={`${question.id}-${option.key || option.text}`} className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-teal/30 hover:bg-teal/5">
              <input className="mt-1 accent-teal" name={`question-${question.id}`} type={question.type === "multiple_choice" ? "checkbox" : "radio"} />
              <span className="font-semibold text-slate-500">{option.key}</span>
              <span className="min-w-0 flex-1">{option.text}</span>
            </label>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-500">
          这道题暂无可展示选项，后续提交页会按题型处理。
        </div>
      )}
    </article>
  );
}
