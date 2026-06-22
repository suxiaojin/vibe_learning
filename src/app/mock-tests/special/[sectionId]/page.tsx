import Link from "next/link";
import { redirect } from "next/navigation";
import { SpecialPracticeRunner } from "@/app/mock-tests/special/[sectionId]/special-practice-runner";
import { getAiGeneratedQuestionsForSections, getMockTestContext, normalizeMockTestCourseKey } from "@/lib/mock-tests";
import { requireUser } from "@/lib/auth";

export default async function SpecialPracticeQuestionPage({
  params,
  searchParams
}: {
  params: Promise<{ sectionId: string }>;
  searchParams?: Promise<{ course?: string; question?: string }>;
}) {
  const [{ sectionId }, query, user] = await Promise.all([params, searchParams, requireUser()]);
  const courseKey = normalizeMockTestCourseKey(query?.course);
  const context = await getMockTestContext(user.id, courseKey);
  const section = context.passedSections.find((item) => item.id === sectionId);

  if (!context.group || !section) {
    redirect(`/mock-tests/special?course=${courseKey}`);
  }

  const questions = await getAiGeneratedQuestionsForSections(context.group, [section]);
  const initialIndex = normalizeQuestionNumber(query?.question, questions.length) - 1;

  if (questions.length === 0) {
    return (
      <main className="grid min-h-dvh place-items-center bg-mist px-5">
        <section className="w-full max-w-xl rounded-[22px] border border-slate-200/80 bg-white px-6 py-12 text-center shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
          <h1 className="text-2xl font-semibold text-ink">暂无可练习题目</h1>
          <p className="mt-3 text-sm font-medium leading-6 text-slate-500">这个知识点下还没有发布到 AI生成题库 的题目。</p>
          <Link className="primary-button mt-6 px-6 text-[15px] font-semibold" href={`/mock-tests/special?course=${courseKey}`}>
            返回专项练习
          </Link>
        </section>
      </main>
    );
  }

  return (
    <SpecialPracticeRunner
      initialIndex={initialIndex}
      questions={questions}
      sectionId={section.id}
      sectionTitle={section.title}
    />
  );
}

function normalizeQuestionNumber(value: string | undefined, total: number) {
  const parsed = Number.parseInt(String(value || "1"), 10);
  if (!Number.isFinite(parsed) || parsed <= 1) {
    return 1;
  }
  return Math.min(parsed, Math.max(1, total));
}
