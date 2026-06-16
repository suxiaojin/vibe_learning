import {
  EmptyMockTestState,
  GentleNote,
  MockTestHeader,
  MockTestPageFrame,
  QuestionList,
  RuleStrip,
  SourceBadge
} from "@/app/mock-tests/mock-test-components";
import { requireUser } from "@/lib/auth";
import {
  getAiGeneratedQuestionsForSections,
  getMockTestContext,
  normalizeMockTestCourseKey,
  pickRandomMockQuestions
} from "@/lib/mock-tests";

export default async function QuickMockTestPage({
  searchParams
}: {
  searchParams?: Promise<{ course?: string }>;
}) {
  const [user, query] = await Promise.all([requireUser(), searchParams]);
  const courseKey = normalizeMockTestCourseKey(query?.course);
  const context = await getMockTestContext(user.id, courseKey);
  const allQuestions = context.group ? await getAiGeneratedQuestionsForSections(context.group, context.passedSections) : [];
  const questions = pickRandomMockQuestions(allQuestions, 10);
  const courseTitle = context.group?.name || (courseKey === "public_subject" ? "公共课" : "专业课");

  return (
    <MockTestPageFrame>
      <MockTestHeader
        courseKey={courseKey}
        courseTitle={courseTitle}
        mode="quick"
        subtitle="从已通过的知识点中随机抽一组 AI 生成题，轻松看看手感。"
        title="快速测试"
      />

      <RuleStrip passedCount={context.passedSections.length} questionCount={allQuestions.length} />

      {!context.group ? (
        <EmptyMockTestState description="请先回到课程中心保存公共课和专业课，系统会按你的课程生成测试入口。" title="还没有可用课程" />
      ) : context.passedSections.length === 0 ? (
        <EmptyMockTestState description="快速测试只从已闯关通过的知识点中抽题。先完成一个知识点，再回来轻轻测一下。" title="还没有已通过知识点" />
      ) : questions.length === 0 ? (
        <EmptyMockTestState description="当前已通过范围内，还没有发布到 AI生成题库 的题目。系统不会混用真题闯关题。" title="暂无可用测试题" />
      ) : (
        <>
          <div className="mt-5 flex justify-end">
            <SourceBadge />
          </div>
          <QuestionList
            description="每次刷新会重新随机抽取，暂不写入闯关进度。"
            questions={questions}
            title="本次快速测试"
          />
          <GentleNote />
        </>
      )}
    </MockTestPageFrame>
  );
}
