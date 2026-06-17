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
      <main className="grid min-h-dvh place-items-center bg-[#f2f3f7] px-5">
        <section className="w-full max-w-xl rounded-3xl bg-white px-6 py-12 text-center shadow-sm">
          <h1 className="text-2xl font-black text-ink">暂无可练习题目</h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-slate-500">这个知识点下还没有发布到 AI生成题库 的题目。</p>
          <Link className="danger-button mt-6 bg-[#ef233c] hover:bg-[#d91f35]" href={`/mock-tests/special?course=${courseKey}`}>
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
