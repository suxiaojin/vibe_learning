import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { createMajorCourse, deleteMajorCourse, updateMajorCourse, updateMajorCourseStatus } from "@/app/admin/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function MajorCoursesPage({
  params
}: {
  params: Promise<{ majorId: string }>;
}) {
  await requireAdmin();
  const { majorId } = await params;
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

      <details className="group mb-6">
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
              {major.learningCourses.map((course) => (
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <span>当前显示 1 至 {major.learningCourses.length} 条，共 {major.learningCourses.length} 条</span>
          <span className="bg-[#0872b9] px-3 py-1 font-bold text-white">1</span>
        </div>
      </section>
    </main>
  );
}
