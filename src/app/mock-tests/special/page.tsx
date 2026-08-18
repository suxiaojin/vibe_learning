import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, CircleMinus } from "lucide-react";
import { EmptyMockTestState, MockTestPageFrame } from "@/app/mock-tests/mock-test-components";
import { SpecialPracticeProgress } from "@/app/mock-tests/special/special-practice-progress";
import { requireUser } from "@/lib/auth";
import {
  getAiGeneratedQuestionsBySection,
  getMockTestContext,
  normalizeMockTestCourseKey,
  type MockTestQuestion,
  type MockTestSection
} from "@/lib/mock-tests";

const PAGE_SIZE = 10;

export default async function SpecialPracticePage({
  searchParams
}: {
  searchParams?: Promise<{ course?: string; page?: string }>;
}) {
  const [user, query] = await Promise.all([requireUser(), searchParams]);
  const courseKey = normalizeMockTestCourseKey(query?.course);
  const context = await getMockTestContext(user.id, courseKey);
  const totalSections = context.passedSections.length;
  const totalPages = Math.max(1, Math.ceil(totalSections / PAGE_SIZE));
  const currentPage = normalizePage(query?.page, totalPages);
  const offset = (currentPage - 1) * PAGE_SIZE;
  const visibleSections = context.passedSections.slice(offset, offset + PAGE_SIZE);
  const questionsBySectionId = context.group
    ? await getAiGeneratedQuestionsBySection(context.group, visibleSections)
    : new Map<string, MockTestQuestion[]>();

  return (
    <MockTestPageFrame>
      <Link className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-teal" href="/course-center">
        <ArrowLeft size={22} />
        返回课程中心
      </Link>
      {!context.group ? (
        <EmptyMockTestState description="请先回到课程中心保存公共课和专业课，系统会按你的课程生成练习入口。" title="还没有可用课程" />
      ) : totalSections === 0 ? (
        <EmptyMockTestState description="专项练习只展示已闯关通过的知识点。先通过一个知识点，再回来练习。" title="还没有已通过知识点" />
      ) : (
        <SpecialPracticeTable
          courseKey={courseKey}
          currentPage={currentPage}
          questionsBySectionId={questionsBySectionId}
          sections={visibleSections}
          totalPages={totalPages}
          totalSections={totalSections}
        />
      )}
    </MockTestPageFrame>
  );
}

function SpecialPracticeTable({
  courseKey,
  questionsBySectionId,
  sections,
  currentPage,
  totalPages,
  totalSections
}: {
  courseKey: "public_subject" | "major";
  questionsBySectionId: ReadonlyMap<string, MockTestQuestion[]>;
  sections: MockTestSection[];
  currentPage: number;
  totalPages: number;
  totalSections: number;
}) {
  return (
    <section className="overflow-hidden rounded-[22px] border border-slate-200/80 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
      <div className="overflow-x-auto">
        <div className="min-w-[760px]">
          <div className="grid min-h-[64px] grid-cols-[minmax(300px,1fr)_260px_124px] items-center bg-slate-50/90 px-5 text-sm font-semibold text-slate-500">
            <div>知识点</div>
            <div className="text-center">进度</div>
            <div className="text-right">操作</div>
          </div>

          <div className="py-2">
            {sections.map((section, index) => (
              <SpecialPracticeRow
                key={section.id}
                courseKey={courseKey}
                questionIds={(questionsBySectionId.get(section.id) || []).map((question) => question.id)}
                section={section}
                toneIndex={index}
              />
            ))}
          </div>
        </div>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 text-sm font-medium text-slate-500">
        <span>共 {totalSections} 个已通过知识点</span>
        {totalPages > 1 ? (
          <nav className="flex items-center gap-2" aria-label="专项练习分页">
            <PageLink courseKey={courseKey} disabled={currentPage <= 1} page={currentPage - 1}>
              上一页
            </PageLink>
            <span className="px-2 font-semibold text-slate-700">
              {currentPage} / {totalPages}
            </span>
            <PageLink courseKey={courseKey} disabled={currentPage >= totalPages} page={currentPage + 1}>
              下一页
            </PageLink>
          </nav>
        ) : null}
      </footer>
    </section>
  );
}

function SpecialPracticeRow({
  courseKey,
  questionIds,
  section,
  toneIndex
}: {
  courseKey: "public_subject" | "major";
  questionIds: string[];
  section: MockTestSection;
  toneIndex: number;
}) {
  return (
    <div className="grid min-h-[68px] grid-cols-[minmax(300px,1fr)_260px_124px] items-center border-t border-slate-100 px-5 text-[15px] text-slate-600 transition hover:bg-teal/5">
      <div className="flex min-w-0 items-center gap-2 pr-4">
        <CircleMinus className="shrink-0 text-teal" size={22} strokeWidth={2.5} />
        <span className="truncate font-semibold text-ink">{section.title}</span>
      </div>
      <SpecialPracticeProgress questionIds={questionIds} sectionId={section.id} toneIndex={toneIndex} />
      <div className="text-right">
        <Link
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-teal px-4 text-sm font-semibold text-white transition hover:bg-teal/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/25"
          href={buildPracticeHref(courseKey, section.id)}
        >
          开始答题
        </Link>
      </div>
    </div>
  );
}

function buildPracticeHref(courseKey: "public_subject" | "major", sectionId: string) {
  return `/mock-tests/special/${sectionId}?course=${courseKey}`;
}

function PageLink({
  courseKey,
  page,
  disabled,
  children
}: {
  courseKey: "public_subject" | "major";
  page: number;
  disabled: boolean;
  children: ReactNode;
}) {
  return disabled ? (
    <span className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-slate-300">{children}</span>
  ) : (
    <Link
      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-600 transition hover:border-teal/40 hover:text-teal"
      href={buildPageHref(courseKey, page)}
    >
      {children}
    </Link>
  );
}

function normalizePage(value: string | undefined, totalPages: number) {
  const parsed = Number.parseInt(String(value || "1"), 10);
  if (!Number.isFinite(parsed) || parsed <= 1) {
    return 1;
  }
  return Math.min(parsed, totalPages);
}

function buildPageHref(courseKey: "public_subject" | "major", page: number) {
  const params = new URLSearchParams({ course: courseKey });
  if (page > 1) {
    params.set("page", String(page));
  }
  return `/mock-tests/special?${params.toString()}`;
}
