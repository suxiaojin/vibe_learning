import { ContentStatus, type Prisma } from "@prisma/client";
import { Filter, Plus } from "lucide-react";
import { createPublicSubject, cyclePublicSubjectStatus, updatePublicSubject } from "@/app/admin/actions";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const contentStatuses = new Set<string>(Object.values(ContentStatus));

function statusText(status: ContentStatus) {
  if (status === "published") {
    return "已发布";
  }
  if (status === "archived") {
    return "停用";
  }
  return "草稿";
}

function statusClass(status: ContentStatus) {
  if (status === "published") {
    return "bg-lime-300 text-lime-800";
  }
  if (status === "archived") {
    return "bg-slate-200 text-slate-600";
  }
  return "bg-slate-200 text-slate-600";
}

export default async function PublicSubjectsPage({
  searchParams
}: {
  searchParams?: Promise<{ regionId?: string; status?: string; keyword?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const selectedRegionId = params?.regionId || "";
  const selectedStatus = contentStatuses.has(params?.status || "") ? params?.status || "" : "";
  const keyword = params?.keyword?.trim() || "";

  const where: Prisma.PublicSubjectWhereInput = {
    ...(selectedRegionId ? { regions: { some: { regionId: selectedRegionId } } } : {}),
    ...(selectedStatus ? { status: selectedStatus as ContentStatus } : {}),
    ...(keyword ? { name: { contains: keyword, mode: "insensitive" } } : {})
  };

  const [regions, subjects] = await Promise.all([
    prisma.region.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }] }),
    prisma.publicSubject.findMany({
      where,
      include: {
        regions: { include: { region: true }, orderBy: { createdAt: "asc" } },
        _count: { select: { studentProfiles: true } }
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }]
    })
  ]);

  return (
    <main>
      <details className="group relative">
        <summary className="absolute right-0 top-0 flex h-10 cursor-pointer list-none items-center gap-2 bg-[#0872b9] px-6 text-sm font-bold text-white transition hover:bg-[#0767a8] [&::-webkit-details-marker]:hidden">
          <Plus size={16} />
          新增公共课
        </summary>
        <div className="mb-7 pr-44">
          <div>
            <h1 className="text-2xl font-black tracking-normal">公共课管理</h1>
            <p className="mt-2 text-sm text-slate-500">管理公共课，并配置每门公共课适用的区域。</p>
          </div>
        </div>

        <form action={createPublicSubject} className="mb-6 hidden border border-slate-300 bg-white p-4 shadow-sm group-open:grid group-open:gap-4 lg:grid-cols-[1.2fr_160px_1.4fr_140px_auto] lg:items-end">
          <div>
            <label className="label">公共课名称</label>
            <input className="input rounded-none" name="name" placeholder="高等数学" required />
          </div>
          <div>
            <label className="label">科目代码</label>
            <input className="input rounded-none" name="code" placeholder="101" />
          </div>
          <div>
            <label className="label">所属区域</label>
            <select className="input min-h-11 rounded-none" name="regionIds" multiple required>
              {regions.map((region) => (
                <option key={region.id} value={region.id}>{region.name}</option>
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
            <label className="label">科目说明</label>
            <input className="input rounded-none" name="description" placeholder="公共课适用范围、考试说明等" />
          </div>
        </form>
      </details>

      <form className="mb-6 grid gap-4 border border-slate-300 bg-white p-4 shadow-sm lg:grid-cols-[1.4fr_1fr_1fr_auto]" action="/admin/public-subjects">
        <div>
          <label className="label">搜索公共课</label>
          <input className="input rounded-none" name="keyword" defaultValue={keyword} placeholder="按名称或关键词搜索..." />
        </div>
        <div>
          <label className="label">区域</label>
          <select className="input rounded-none" name="regionId" defaultValue={selectedRegionId}>
            <option value="">全部区域</option>
            {regions.map((region) => (
              <option key={region.id} value={region.id}>{region.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">状态</label>
          <select className="input rounded-none" name="status" defaultValue={selectedStatus}>
            <option value="">全部状态</option>
            <option value="draft">草稿</option>
            <option value="published">已发布</option>
            <option value="archived">停用</option>
          </select>
        </div>
        <div className="flex items-end">
          <button className="secondary-button h-11 rounded-none" type="submit">
            <Filter size={16} />
            筛选
          </button>
        </div>
      </form>

      <section className="overflow-hidden border border-slate-300 bg-white shadow-sm">
        <div className="max-h-[calc(100vh-300px)] min-h-[520px] overflow-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="sticky top-0 bg-[#eef0f4] text-xs font-bold uppercase text-slate-600">
              <tr>
                <th className="border-b border-slate-300 px-4 py-3">公共课名称</th>
                <th className="border-b border-slate-300 px-4 py-3">科目代码</th>
                <th className="border-b border-slate-300 px-4 py-3">适用区域</th>
                <th className="border-b border-slate-300 px-4 py-3">学生数</th>
                <th className="border-b border-slate-300 px-4 py-3">状态</th>
                <th className="border-b border-slate-300 px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {subjects.map((subject) => {
                const selectedRegionIds = subject.regions.map((item) => item.regionId);
                return (
                  <tr key={subject.id} className="align-top hover:bg-slate-50">
                    <td className="px-4 py-4">
                      <p className="font-semibold">{subject.name}</p>
                      {subject.description ? <p className="mt-1 text-xs text-slate-500">{subject.description}</p> : null}
                    </td>
                    <td className="px-4 py-4 text-slate-700">{subject.code || "-"}</td>
                    <td className="px-4 py-4 text-slate-600">{subject.regions.length ? subject.regions.map((item) => item.region.name).join("、") : "未绑定"}</td>
                    <td className="px-4 py-4 text-slate-700">{subject._count.studentProfiles}</td>
                    <td className="px-4 py-4">
                      <form action={cyclePublicSubjectStatus}>
                        <input type="hidden" name="id" value={subject.id} />
                        <button className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(subject.status)}`} type="submit">
                          {statusText(subject.status)}
                        </button>
                      </form>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <details className="inline-block text-left">
                        <summary className="cursor-pointer list-none text-sm font-semibold text-[#0869a9] [&::-webkit-details-marker]:hidden">编辑</summary>
                        <form action={updatePublicSubject} className="absolute right-10 z-10 mt-2 grid w-[620px] gap-3 border border-slate-300 bg-white p-4 text-left shadow-xl">
                          <input type="hidden" name="id" value={subject.id} />
                          <div className="grid grid-cols-[1fr_160px] gap-3">
                            <input className="input rounded-none" name="name" defaultValue={subject.name} required />
                            <input className="input rounded-none" name="code" defaultValue={subject.code || ""} />
                          </div>
                          <select className="input min-h-24 rounded-none" name="regionIds" multiple defaultValue={selectedRegionIds} required>
                            {regions.map((region) => (
                              <option key={region.id} value={region.id}>{region.name}</option>
                            ))}
                          </select>
                          <input className="input rounded-none" name="description" defaultValue={subject.description || ""} />
                          <div className="grid grid-cols-[1fr_auto] gap-3">
                            <select className="input rounded-none" name="status" defaultValue={subject.status}>
                              <option value="draft">草稿</option>
                              <option value="published">已发布</option>
                              <option value="archived">停用</option>
                            </select>
                            <button className="primary-button rounded-none" type="submit">保存</button>
                          </div>
                        </form>
                      </details>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <span>当前显示 1 至 {subjects.length} 条，共 {subjects.length} 条</span>
          <span className="bg-[#0872b9] px-3 py-1 font-bold text-white">1</span>
        </div>
      </section>
    </main>
  );
}
