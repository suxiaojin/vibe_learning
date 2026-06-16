import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, BookOpenCheck, CheckCircle2, FileQuestion, Sparkles } from "lucide-react";
import { StudentSidebar } from "@/components/student-sidebar";
import { normalizeQuestionOptions, type MockTestQuestion } from "@/lib/mock-tests";
import { cn } from "@/lib/utils";

export const courseLabels = {
  public_subject: "公共课",
  major: "专业课"
} as const;

export const questionTypeLabels: Record<string, string> = {
  single_choice: "单选题",
  multiple_choice: "多选题",
  true_false: "判断题",
  fill_blank: "填空题",
  comprehensive: "综合题"
};

export const difficultyLabels: Record<string, string> = {
  easy: "基础",
  medium: "适中",
  hard: "挑战"
};

export function MockTestPageFrame({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-dvh bg-mist lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      <StudentSidebar active="course-center" />
      <section className="min-w-0 px-5 py-8 lg:px-8 xl:px-10">
        <div className="mx-auto w-full max-w-[1180px]">{children}</div>
      </section>
    </main>
  );
}

export function MockTestHeader({
  title,
  subtitle,
  courseKey,
  courseTitle,
  mode
}: {
  title: string;
  subtitle: string;
  courseKey: "public_subject" | "major";
  courseTitle: string;
  mode: "quick" | "special";
}) {
  return (
    <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <Link className="inline-flex items-center gap-2 text-sm font-black text-sky-600 hover:text-sky-700" href="/course-center">
        <ArrowLeft size={17} />
        返回课程中心
      </Link>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-sm font-black text-slate-400">{courseLabels[courseKey]} · {courseTitle}</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-ink lg:text-4xl">{title}</h1>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-500 lg:text-base">{subtitle}</p>
        </div>
        <div className="flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
          <CourseTab courseKey="public_subject" mode={mode} selected={courseKey === "public_subject"} />
          <CourseTab courseKey="major" mode={mode} selected={courseKey === "major"} />
        </div>
      </div>
    </header>
  );
}

function CourseTab({
  courseKey,
  mode,
  selected
}: {
  courseKey: "public_subject" | "major";
  mode: "quick" | "special";
  selected: boolean;
}) {
  return (
    <Link
      className={cn(
        "rounded-xl px-4 py-2 text-sm font-black transition",
        selected ? "bg-white text-teal shadow-sm" : "text-slate-500 hover:text-slate-700"
      )}
      href={`/mock-tests/${mode}?course=${courseKey}`}
    >
      {courseLabels[courseKey]}
    </Link>
  );
}

export function RuleStrip({
  passedCount,
  questionCount
}: {
  passedCount: number;
  questionCount: number;
}) {
  return (
    <section className="mt-5 grid gap-3 md:grid-cols-4">
      <RuleCard label="题目来源" value="AI生成题库" />
      <RuleCard label="开放范围" value={`${passedCount} 个已通过知识点`} />
      <RuleCard label="可用题量" value={`${questionCount} 道`} />
      <RuleCard label="进度影响" value="不影响闯关" />
    </section>
  );
}

function RuleCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <p className="text-xs font-black text-slate-400">{label}</p>
      <p className="mt-2 text-lg font-black text-ink">{value}</p>
    </div>
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
    <section className="mt-5 rounded-3xl border border-dashed border-sky-300 bg-white px-6 py-12 text-center shadow-sm">
      <BookOpenCheck className="mx-auto text-sky-500" size={36} />
      <h2 className="mt-4 text-xl font-black text-ink">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm font-semibold leading-6 text-slate-500">{description}</p>
    </section>
  );
}

export function QuestionList({
  questions,
  title,
  description
}: {
  questions: MockTestQuestion[];
  title: string;
  description: string;
}) {
  return (
    <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-ink">{title}</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">{description}</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full bg-teal/10 px-4 py-2 text-sm font-black text-teal">
          <CheckCircle2 size={17} />
          本次 {questions.length} 题
        </span>
      </div>

      <div className="mt-6 divide-y divide-slate-100">
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
      <div className="flex flex-wrap items-center gap-2 text-xs font-black text-slate-400">
        <span className="rounded-full bg-sky-50 px-3 py-1 text-sky-600">第 {index} 题</span>
        <span>{questionTypeLabels[question.type] || question.type}</span>
        <span>{difficultyLabels[question.difficulty] || question.difficulty}</span>
        <span className="truncate">来源：{question.questionBank.title}</span>
      </div>
      <h3 className="mt-3 text-base font-black leading-7 text-ink">{question.stem}</h3>
      {options.length > 0 ? (
        <div className="mt-4 grid gap-2">
          {options.map((option) => (
            <label key={`${question.id}-${option.key || option.text}`} className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:bg-sky-50">
              <input className="mt-1 accent-sky-500" name={`question-${question.id}`} type={question.type === "multiple_choice" ? "checkbox" : "radio"} />
              <span className="font-black text-slate-500">{option.key}</span>
              <span className="min-w-0 flex-1">{option.text}</span>
            </label>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-500">
          这道题暂无可展示选项，后续提交页会按题型处理。
        </div>
      )}
    </article>
  );
}

export function GentleNote() {
  return (
    <div className="mt-5 flex items-start gap-3 rounded-2xl border border-sky-100 bg-sky-50 px-5 py-4 text-sm font-semibold leading-6 text-slate-600">
      <Sparkles className="mt-0.5 shrink-0 text-sky-500" size={18} />
      <p>这里暂时只做测试页展示与选择，不写入闯关进度。等题池和流程确认后，再接提交、判分和错题记录。</p>
    </div>
  );
}

export function SourceBadge() {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-teal">
      <FileQuestion size={15} />
      仅使用 AI生成题库
    </span>
  );
}
