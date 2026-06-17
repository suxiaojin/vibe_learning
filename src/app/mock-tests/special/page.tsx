import Link from "next/link";
import type { ReactNode } from "react";
import { CircleMinus } from "lucide-react";
import { EmptyMockTestState, MockTestPageFrame } from "@/app/mock-tests/mock-test-components";
import { requireUser } from "@/lib/auth";
import { getMockTestContext, normalizeMockTestCourseKey, type MockTestSection } from "@/lib/mock-tests";

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

  return (
    <MockTestPageFrame>
      {!context.group ? (
        <EmptyMockTestState description="请先回到课程中心保存公共课和专业课，系统会按你的课程生成练习入口。" title="还没有可用课程" />
      ) : totalSections === 0 ? (
        <EmptyMockTestState description="专项练习只展示已闯关通过的知识点。先通过一个知识点，再回来练习。" title="还没有已通过知识点" />
      ) : (
        <SpecialPracticeTable
          courseKey={courseKey}
          currentPage={currentPage}
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
  sections,
  currentPage,
  totalPages,
  totalSections
}: {
  courseKey: "public_subject" | "major";
  sections: MockTestSection[];
  currentPage: number;
  totalPages: number;
  totalSections: number;
}) {
  return (
    <section className="overflow-hidden rounded-[18px] bg-white shadow-sm">
      <div className="overflow-x-auto">
        <div className="min-w-[860px]">
          <div className="grid min-h-[70px] grid-cols-[minmax(300px,1fr)_130px_150px_120px] items-center rounded-[18px] bg-[#f5f5f5] px-5 text-lg font-medium text-slate-600">
            <div>知识点</div>
            <div className="text-center">正确率</div>
            <div className="text-center">进度</div>
            <div className="text-right">操作</div>
          </div>

          <div className="py-2">
            {sections.map((section) => (
              <SpecialPracticeRow key={section.id} courseKey={courseKey} section={section} />
            ))}
          </div>
        </div>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 text-sm font-semibold text-slate-500">
        <span>共 {totalSections} 个已通过知识点</span>
        {totalPages > 1 ? (
          <nav className="flex items-center gap-2" aria-label="专项练习分页">
            <PageLink courseKey={courseKey} disabled={currentPage <= 1} page={currentPage - 1}>
              上一页
            </PageLink>
            <span className="px-2 font-black text-slate-700">
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

function SpecialPracticeRow({ courseKey, section }: { courseKey: "public_subject" | "major"; section: MockTestSection }) {
  return (
    <div className="grid min-h-[70px] grid-cols-[minmax(300px,1fr)_130px_150px_120px] items-center px-5 text-lg text-[#3f4a5a] transition hover:bg-slate-50">
      <div className="flex min-w-0 items-center gap-2 pr-4">
        <CircleMinus className="shrink-0 text-[#ef233c]" size={24} strokeWidth={3} />
        <span className="truncate font-medium text-black">{section.title}</span>
      </div>
      <div className="text-center font-medium">0%</div>
      <div className="text-center font-medium">已答0道</div>
      <div className="text-right">
        <Link
          className="inline-flex min-h-10 items-center justify-center rounded-lg bg-[#ef233c] px-4 text-base font-medium text-white transition hover:bg-[#d91f35] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
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
      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-600 transition hover:border-[#ef233c] hover:text-[#ef233c]"
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
