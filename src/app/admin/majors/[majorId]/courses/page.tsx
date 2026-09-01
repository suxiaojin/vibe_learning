import Link from "next/link";
import { ContentStatus } from "@prisma/client";
import { ArrowLeft, Filter, Plus } from "lucide-react";
import { createMajorCourse, deleteMajorCourse, updateMajorCourse, updateMajorCourseStatus } from "@/app/admin/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { CopyMajorCourseDialog } from "@/components/copy-major-course-dialog";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const contentStatuses = new Set<string>(Object.values(ContentStatus));

const copyErrorMessages: Record<string, string> = {
  "source-course-not-found": "来源课程不存在或已被删除，未执行复制。",
  "invalid-target-region": "请选择来源区域以外的目标区域。",
  "target-region-unavailable": "目标区域尚未绑定当前专业，未执行复制。",
  "target-course-exists": "目标区域已经存在同名课程，未执行复制。",
  "source-content-invalid": "来源课程的内容关联不完整，未执行复制。"
};

export default async function MajorCoursesPage({
  params,
  searchParams
}: {
  params: Promise<{ majorId: string }>;
  searchParams?: Promise<{ copiedCourseId?: string; copyError?: string; regionId?: string; status?: string }>;
}) {
  await requireAdmin();
  const { majorId } = await params;
  const query = await searchParams;
  const major = await prisma.major.findUniqueOrThrow({
    where: { id: majorId },
    include: {
      regions: {
        include: { region: true },
        orderBy: { createdAt: "asc" }
      },
      learningCourses: {
        where: { courseType: "major" },
        include: {
          region: true,
          _count: { select: { chapters: true, syllabusItems: { where: { checkpointScope: null } } } }
        },
        orderBy: [{ region: { sortOrder: "asc" } }, { sortOrder: "asc" }, { createdAt: "desc" }]
      }
    }
  });
  const copiedCourse = query?.copiedCourseId
    ? major.learningCourses.find((course) => course.id === query.copiedCourseId)
    : null;
  const copyErrorMessage = query?.copyError ? copyErrorMessages[query.copyError] : null;
  const selectedRegionId = major.regions.some((item) => item.regionId === query?.regionId) ? query?.regionId || "" : "";
  const selectedStatus = contentStatuses.has(query?.status || "") ? query?.status || "" : "";
  const displayedCourses = major.learningCourses.filter(
    (course) => (!selectedRegionId || course.regionId === selectedRegionId) && (!selectedStatus || course.status === selectedStatus)
  );

  return (
    <main>
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link className="mb-3 inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-[#0869a9]" href="/admin/majors">
            <ArrowLeft size={16} />
            返回专业课管理
          </Link>
          <h1 className="text-2xl font-black tracking-normal">{major.name}课程</h1>
          <p className="mt-2 text-sm text-slate-500">在专业下维护课程，后续可进入课程维护考察目标、考察内容和试卷。</p>
        </div>
      </div>

      {copiedCourse ? (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" role="status">
          <span>
            已复制到{copiedCourse.region.name}，共复制章节 {copiedCourse._count.chapters}、考察内容 {copiedCourse._count.syllabusItems}。新课程为草稿，复制后与原课程互不影响。
          </span>
          <Link className="font-bold text-emerald-900 underline" href={`/admin/majors/${major.id}/courses/${copiedCourse.id}`}>前往编辑</Link>
        </div>
      ) : null}

      {copyErrorMessage ? (
        <div className="mb-6 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {copyErrorMessage}
        </div>
      ) : null}

      <div className="relative mb-6">
        <details className="group">
          <summary className="inline-flex h-10 cursor-pointer list-none items-center gap-2 bg-[#0872b9] px-6 text-sm font-bold text-white transition hover:bg-[#0767a8] [&::-webkit-details-marker]:hidden">
            <Plus size={16} />
            新增课程
          </summary>
          <form action={createMajorCourse} className="mt-4 hidden border border-slate-300 bg-white p-4 shadow-sm group-open:grid group-open:gap-4 lg:grid-cols-[1.3fr_220px_140px_auto] lg:items-end">
            <input type="hidden" name="majorId" value={major.id} />
            <div>
              <label className="label">课程名称</label>
              <input className="input rounded-none" name="name" placeholder="专业综合基础" required />
            </div>
            <div>
              <label className="label">适用区域</label>
              <select className="input rounded-none" name="regionId" required>
                {major.regions.map((item) => (
                  <option key={item.regionId} value={item.regionId}>{item.region.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">状态</label>
              <select className="input rounded-none" name="status" defaultValue="draft">
                <option value="draft">草稿</option>
                <option value="published">已发布</option>
                <option value="archived">停用</option>
              </select>
            </div>
            <button className="primary-button rounded-none" type="submit">保存</button>
            <div className="lg:col-span-3">
              <label className="label">课程说明</label>
              <input className="input rounded-none" name="description" placeholder="考试范围、课程说明等" />
            </div>
          </form>
        </details>

        <form
          action={`/admin/majors/${major.id}/courses`}
          className="mt-4 grid gap-3 sm:grid-cols-[minmax(180px,1fr)_minmax(160px,1fr)_auto_auto] lg:absolute lg:left-44 lg:top-0 lg:mt-0 lg:w-[660px]"
        >
          <div>
            <label className="sr-only" htmlFor="course-region-filter">区域</label>
            <select className="input h-10 rounded-none py-2" defaultValue={selectedRegionId} id="course-region-filter" name="regionId">
              <option value="">全部区域</option>
              {major.regions.map((item) => (
                <option key={item.regionId} value={item.regionId}>{item.region.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="sr-only" htmlFor="course-status-filter">状态</label>
            <select className="input h-10 rounded-none py-2" defaultValue={selectedStatus} id="course-status-filter" name="status">
              <option value="">全部状态</option>
              <option value="draft">草稿</option>
              <option value="published">已发布</option>
              <option value="archived">停用</option>
            </select>
          </div>
          <button className="secondary-button h-10 rounded-none px-4" type="submit">
            <Filter aria-hidden="true" size={15} />
            筛选
          </button>
          <Link className="secondary-button h-10 rounded-none px-4" href={`/admin/majors/${major.id}/courses`}>重置</Link>
        </form>
      </div>

      <section className="overflow-hidden border border-slate-300 bg-white shadow-sm">
        <div className="max-h-[calc(100vh-250px)] min-h-[520px] overflow-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="sticky top-0 bg-[#eef0f4] text-xs font-bold uppercase text-slate-600">
              <tr>
                <th className="border-b border-slate-300 px-4 py-3">课程名称</th>
                <th className="border-b border-slate-300 px-4 py-3">区域</th>
                <th className="border-b border-slate-300 px-4 py-3">内容</th>
                <th className="border-b border-slate-300 px-4 py-3">状态</th>
                <th className="border-b border-slate-300 px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {displayedCourses.map((course) => {
                const targetRegions = major.regions
                  .filter((item) => item.regionId !== course.regionId)
                  .map((item) => ({
                    id: item.regionId,
                    name: item.region.name,
                    disabled: major.learningCourses.some(
                      (existingCourse) => existingCourse.regionId === item.regionId && existingCourse.name === course.name
                    )
                  }));

                return (
                  <tr key={course.id} className="align-top hover:bg-slate-50">
                  <td className="px-4 py-4">
                    <Link className="font-semibold text-[#0869a9] hover:underline" href={`/admin/majors/${major.id}/courses/${course.id}`}>{course.name}</Link>
                    {course.description ? <p className="mt-1 text-xs text-slate-500">{course.description}</p> : null}
                  </td>
                  <td className="px-4 py-4 text-slate-700">{course.region.name}</td>
                  <td className="px-4 py-4 text-slate-600">
                    章节 {course._count.chapters} / 考察内容 {course._count.syllabusItems}
                  </td>
                  <td className="px-4 py-4">
                    <form action={updateMajorCourseStatus} className="flex items-center gap-2">
                      <input type="hidden" name="id" value={course.id} />
                      <input type="hidden" name="majorId" value={major.id} />
                      <select className="input h-9 rounded-none py-1 text-xs font-semibold" name="status" defaultValue={course.status}>
                        <option value="draft">草稿</option>
                        <option value="published">已发布</option>
                        <option value="archived">停用</option>
                      </select>
                      <button className="secondary-button h-9 rounded-none px-3 text-xs" type="submit">保存</button>
                    </form>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <CopyMajorCourseDialog
                        chapterCount={course._count.chapters}
                        courseId={course.id}
                        courseName={course.name}
                        majorId={major.id}
                        sourceRegionName={course.region.name}
                        syllabusItemCount={course._count.syllabusItems}
                        targetRegions={targetRegions}
                      />
                      <details className="inline-block text-left">
                      <summary className="cursor-pointer list-none text-sm font-semibold text-[#0869a9] [&::-webkit-details-marker]:hidden">编辑</summary>
                      <form action={updateMajorCourse} className="absolute right-10 z-10 mt-2 grid w-[620px] gap-3 border border-slate-300 bg-white p-4 text-left shadow-xl">
                        <input type="hidden" name="id" value={course.id} />
                        <input type="hidden" name="majorId" value={major.id} />
                        <input className="input rounded-none" name="name" defaultValue={course.name} required />
                        <div className="grid grid-cols-2 gap-3">
                          <select className="input rounded-none" name="regionId" defaultValue={course.regionId} required>
                            {major.regions.map((item) => (
                              <option key={item.regionId} value={item.regionId}>{item.region.name}</option>
                            ))}
                          </select>
                          <select className="input rounded-none" name="status" defaultValue={course.status}>
                            <option value="draft">草稿</option>
                            <option value="published">已发布</option>
                            <option value="archived">停用</option>
                          </select>
                        </div>
                        <input className="input rounded-none" name="description" defaultValue={course.description || ""} />
                        <div className="flex justify-end gap-3">
                          <ConfirmSubmitButton
                            className="danger-button rounded-none"
                            form={`delete-major-course-${course.id}`}
                            message={`确认删除课程“${course.name}”吗？课程大纲将一并删除，章节及其他关联记录会解除课程关联。此操作不可恢复。`}
                          >
                            删除
                          </ConfirmSubmitButton>
                          <button className="primary-button rounded-none" type="submit">保存</button>
                        </div>
                      </form>
                      <form id={`delete-major-course-${course.id}`} action={deleteMajorCourse}>
                        <input type="hidden" name="id" value={course.id} />
                        <input type="hidden" name="majorId" value={major.id} />
                      </form>
                      </details>
                    </div>
                  </td>
                  </tr>
                );
              })}
              {!displayedCourses.length ? (
                <tr>
                  <td className="px-4 py-12 text-center text-slate-500" colSpan={5}>当前筛选条件下暂无课程</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <span>当前显示 {displayedCourses.length ? 1 : 0} 至 {displayedCourses.length} 条，共 {displayedCourses.length} 条</span>
          <span className="bg-[#0872b9] px-3 py-1 font-bold text-white">1</span>
        </div>
      </section>
    </main>
  );
}
