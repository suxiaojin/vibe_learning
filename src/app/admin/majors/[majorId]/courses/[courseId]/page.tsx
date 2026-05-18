import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { createSyllabusItem, updateSyllabusItem, updateSyllabusItemStatus } from "@/app/admin/actions";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function requirementText(requirement: string | null) {
  if (requirement === "know") {
    return "了解";
  }
  if (requirement === "understand") {
    return "理解";
  }
  if (requirement === "master") {
    return "掌握";
  }
  if (requirement === "apply") {
    return "应用";
  }
  return "-";
}

function statusOptions(defaultValue: string) {
  void defaultValue;
  return (
    <>
      <option value="draft">草稿</option>
      <option value="published">已发布</option>
      <option value="archived">停用</option>
    </>
  );
}

function requirementOptions(defaultValue: string | null) {
  void defaultValue;
  return (
    <>
      <option value="">未设置</option>
      <option value="know">了解</option>
      <option value="understand">理解</option>
      <option value="master">掌握</option>
      <option value="apply">应用</option>
    </>
  );
}

export default async function MajorCourseDetailPage({
  params
}: {
  params: Promise<{ majorId: string; courseId: string }>;
}) {
  await requireAdmin();
  const { majorId, courseId } = await params;
  const course = await prisma.learningCourse.findFirstOrThrow({
    where: {
      id: courseId,
      majorId,
      courseType: "major"
    },
    include: {
      region: true,
      major: true,
      syllabusItems: {
        orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }]
      },
      chapters: {
        include: {
          points: {
            orderBy: { sortOrder: "asc" }
          }
        },
        orderBy: { sortOrder: "asc" }
      },
      examPapers: {
        orderBy: [{ year: "desc" }, { sortOrder: "asc" }]
      }
    }
  });

  return (
    <main>
      <div className="mb-7">
        <Link className="mb-3 inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-[#0869a9]" href={`/admin/majors/${majorId}/courses`}>
          <ArrowLeft size={16} />
          返回课程列表
        </Link>
        <h1 className="text-2xl font-black tracking-normal">{course.name}</h1>
        <p className="mt-2 text-sm text-slate-500">{course.region.name} / {course.major?.name || "专业课"} / 考察目标与考察内容</p>
      </div>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="border border-slate-300 bg-white p-5 shadow-sm">
          <p className="text-sm font-bold text-slate-500">考察内容</p>
          <p className="mt-3 text-3xl font-black">{course.syllabusItems.length}</p>
        </div>
        <div className="border border-slate-300 bg-white p-5 shadow-sm">
          <p className="text-sm font-bold text-slate-500">章节</p>
          <p className="mt-3 text-3xl font-black">{course.chapters.length}</p>
        </div>
        <div className="border border-slate-300 bg-white p-5 shadow-sm">
          <p className="text-sm font-bold text-slate-500">试卷</p>
          <p className="mt-3 text-3xl font-black">{course.examPapers.length}</p>
        </div>
      </section>

      <section className="mt-6 border border-slate-300 bg-white p-5 shadow-sm">
        <details className="group relative">
          <summary className="absolute right-0 top-0 flex h-10 cursor-pointer list-none items-center gap-2 bg-[#0872b9] px-5 text-sm font-bold text-white transition hover:bg-[#0767a8] [&::-webkit-details-marker]:hidden">
            <Plus size={16} />
            新增考察内容
          </summary>
          <div className="pr-44">
            <h2 className="text-lg font-black">考察目标 / 考察内容</h2>
            <p className="mt-2 text-sm text-slate-500">维护课程大纲条目、考察要求和对应说明。</p>
          </div>
          <form action={createSyllabusItem} className="mt-5 hidden border border-slate-200 bg-slate-50 p-4 group-open:grid group-open:gap-3 lg:grid-cols-[120px_1fr_160px_140px_auto] lg:items-end">
            <input type="hidden" name="ownerType" value="major" />
            <input type="hidden" name="ownerId" value={majorId} />
            <input type="hidden" name="courseId" value={course.id} />
            <div>
              <label className="label">编码</label>
              <input className="input rounded-none" name="code" placeholder="1.1" />
            </div>
            <div>
              <label className="label">标题</label>
              <input className="input rounded-none" name="title" placeholder="考察内容标题" required />
            </div>
            <div>
              <label className="label">考察要求</label>
              <select className="input rounded-none" name="requirement" defaultValue="">
                <option value="">未设置</option>
                <option value="know">了解</option>
                <option value="understand">理解</option>
                <option value="master">掌握</option>
                <option value="apply">应用</option>
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
            <div className="lg:col-span-4">
              <label className="label">描述</label>
              <input className="input rounded-none" name="description" placeholder="大纲原文、考察目标说明等" />
            </div>
          </form>
        </details>
        <div className="mt-5 overflow-hidden border border-slate-200">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="bg-[#eef0f4] text-xs font-bold uppercase text-slate-600">
              <tr>
                <th className="border-b border-slate-300 px-4 py-3">编码</th>
                <th className="border-b border-slate-300 px-4 py-3">标题</th>
                <th className="border-b border-slate-300 px-4 py-3">要求</th>
                <th className="border-b border-slate-300 px-4 py-3">状态</th>
                <th className="border-b border-slate-300 px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {course.syllabusItems.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3 text-slate-600">{item.code || "-"}</td>
                  <td className="px-4 py-3">
                    <p className="font-semibold">{item.title}</p>
                    {item.description ? <p className="mt-1 text-xs text-slate-500">{item.description}</p> : null}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{requirementText(item.requirement)}</td>
                  <td className="px-4 py-3">
                    <form action={updateSyllabusItemStatus} className="flex items-center gap-2">
                      <input type="hidden" name="ownerType" value="major" />
                      <input type="hidden" name="ownerId" value={majorId} />
                      <input type="hidden" name="courseId" value={course.id} />
                      <input type="hidden" name="id" value={item.id} />
                      <select className="input h-9 rounded-none py-1 text-xs font-semibold" name="status" defaultValue={item.status}>
                        <option value="draft">草稿</option>
                        <option value="published">已发布</option>
                        <option value="archived">停用</option>
                      </select>
                      <button className="secondary-button h-9 rounded-none px-3 text-xs" type="submit">保存</button>
                    </form>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <details className="inline-block text-left">
                      <summary className="cursor-pointer list-none text-sm font-semibold text-[#0869a9] [&::-webkit-details-marker]:hidden">编辑</summary>
                      <form action={updateSyllabusItem} className="absolute right-10 z-10 mt-2 grid w-[720px] gap-3 border border-slate-300 bg-white p-4 text-left shadow-xl">
                        <input type="hidden" name="ownerType" value="major" />
                        <input type="hidden" name="ownerId" value={majorId} />
                        <input type="hidden" name="courseId" value={course.id} />
                        <input type="hidden" name="id" value={item.id} />
                        <div className="grid grid-cols-[120px_1fr] gap-3">
                          <input className="input rounded-none" name="code" defaultValue={item.code || ""} />
                          <input className="input rounded-none" name="title" defaultValue={item.title} required />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <select className="input rounded-none" name="requirement" defaultValue={item.requirement || ""}>
                            {requirementOptions(item.requirement)}
                          </select>
                          <select className="input rounded-none" name="status" defaultValue={item.status}>
                            {statusOptions(item.status)}
                          </select>
                        </div>
                        <input className="input rounded-none" name="description" defaultValue={item.description || ""} />
                        <div className="flex justify-end">
                          <button className="primary-button rounded-none" type="submit">保存</button>
                        </div>
                      </form>
                    </details>
                  </td>
                </tr>
              ))}
              {course.syllabusItems.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan={5}>还没有考察内容。</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
