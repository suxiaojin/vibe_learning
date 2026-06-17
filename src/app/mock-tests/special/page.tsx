import Link from "next/link";
import {
  EmptyMockTestState,
  MockTestPageFrame,
  QuestionList
} from "@/app/mock-tests/mock-test-components";
import { requireUser } from "@/lib/auth";
import {
  getAiGeneratedQuestionsForSections,
  getMockTestContext,
  normalizeMockTestCourseKey,
  pickRandomMockQuestions,
  type MockTestSection
} from "@/lib/mock-tests";
import { cn } from "@/lib/utils";

export default async function SpecialMockTestPage({
  searchParams
}: {
  searchParams?: Promise<{ course?: string; sectionId?: string | string[] }>;
}) {
  const [user, query] = await Promise.all([requireUser(), searchParams]);
  const courseKey = normalizeMockTestCourseKey(query?.course);
  const selectedSectionIds = normalizeSelectedSectionIds(query?.sectionId);
  const context = await getMockTestContext(user.id, courseKey);
  const selectedSections = context.passedSections.filter((section) => selectedSectionIds.includes(section.id));
  const selectedQuestions = context.group && selectedSections.length > 0 ? await getAiGeneratedQuestionsForSections(context.group, selectedSections) : [];
  const questions = pickRandomMockQuestions(selectedQuestions, 10);

  return (
    <MockTestPageFrame>
      {!context.group ? (
        <EmptyMockTestState description="请先回到课程中心保存公共课和专业课，系统会按你的课程生成测试入口。" title="还没有可用课程" />
      ) : context.passedSections.length === 0 ? (
        <EmptyMockTestState description="专项测试只开放已闯关通过的知识点。先通过一个知识点，再回来挑一组练。" title="还没有已通过知识点" />
      ) : (
        <>
          <SectionPicker courseKey={courseKey} sections={context.passedSections} selectedSectionIds={selectedSectionIds} />
          {selectedSections.length === 0 ? (
            <EmptyMockTestState description="从上方选择一个或多个已通过知识点后，系统会从对应的 AI生成题库 中抽题。" title="先选择知识点" />
          ) : questions.length === 0 ? (
            <EmptyMockTestState description="所选知识点下还没有发布到 AI生成题库 的题目。系统不会混用真题闯关题。" title="暂无可用测试题" />
          ) : (
            <QuestionList className="mt-5" questions={questions} />
          )}
        </>
      )}
    </MockTestPageFrame>
  );
}

function SectionPicker({
  courseKey,
  sections,
  selectedSectionIds
}: {
  courseKey: "public_subject" | "major";
  sections: MockTestSection[];
  selectedSectionIds: string[];
}) {
  return (
    <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-ink">选择已通过知识点</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">点击知识点可加入或移出本次专项测试。</p>
        </div>
        {selectedSectionIds.length > 0 ? (
          <Link className="secondary-button min-h-10 px-4 text-sm" href={`/mock-tests/special?course=${courseKey}`}>
            清空选择
          </Link>
        ) : null}
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {sections.map((section) => {
          const selected = selectedSectionIds.includes(section.id);

          return (
            <Link
              key={section.id}
              className={cn(
                "rounded-2xl border px-4 py-4 transition",
                selected ? "border-teal bg-teal/10 text-teal shadow-sm" : "border-slate-200 bg-slate-50/70 text-slate-600 hover:border-sky-300 hover:bg-sky-50"
              )}
              href={buildSectionToggleHref(courseKey, selectedSectionIds, section.id)}
            >
              <p className="truncate text-sm font-black">{section.title}</p>
              <p className="mt-1 truncate text-xs font-semibold opacity-75">{section.chapterTitle}</p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function normalizeSelectedSectionIds(value?: string | string[]) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return Array.from(new Set(values.map((item) => String(item).trim()).filter(Boolean)));
}

function buildSectionToggleHref(courseKey: "public_subject" | "major", selectedSectionIds: string[], sectionId: string) {
  const nextIds = selectedSectionIds.includes(sectionId)
    ? selectedSectionIds.filter((id) => id !== sectionId)
    : [...selectedSectionIds, sectionId];
  const params = new URLSearchParams({ course: courseKey });
  nextIds.forEach((id) => params.append("sectionId", id));
  return `/mock-tests/special?${params.toString()}`;
}
