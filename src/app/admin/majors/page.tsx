import { ContentStatus, type Prisma } from "@prisma/client";
import { Filter, Plus } from "lucide-react";
import { createMajor, cycleMajorStatus, updateMajor } from "@/app/admin/actions";
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

export default async function MajorsPage({
  searchParams
}: {
  searchParams?: Promise<{ regionId?: string; status?: string; keyword?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const selectedRegionId = params?.regionId || "";
  const selectedStatus = contentStatuses.has(params?.status || "") ? params?.status || "" : "";
  const keyword = params?.keyword?.trim() || "";

  const where: Prisma.MajorWhereInput = {
    ...(selectedRegionId ? { regions: { some: { regionId: selectedRegionId } } } : {}),
    ...(selectedStatus ? { status: selectedStatus as ContentStatus } : {}),
    ...(keyword ? { name: { contains: keyword, mode: "insensitive" } } : {})
  };

  const [regions, majors] = await Promise.all([
    prisma.region.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }] }),
    prisma.major.findMany({
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
          新增专业
        </summary>
        <div className="mb-7 pr-44">
          <div>
            <h1 className="text-2xl font-black tracking-normal">专业课管理</h1>
            <p className="mt-2 text-sm text-slate-500">管理学生可选择的专业，并配置每个专业适用的区域。</p>
          </div>
        </div>

        <form action={createMajor} className="mb-6 hidden border border-slate-300 bg-white p-4 shadow-sm group-open:grid group-open:gap-4 lg:grid-cols-[1.3fr_1.6fr_140px_auto] lg:items-end">
          <div>
            <label className="label">专业名称</label>
            <input className="input rounded-none" name="name" placeholder="计算机专业" required />
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
            <label className="label">专业说明</label>
            <input className="input rounded-none" name="description" placeholder="专业适用范围、考试方向等" />
          </div>
        </form>
      </details>

      <form className="mb-6 grid gap-4 border border-slate-300 bg-white p-4 shadow-sm lg:grid-cols-[1.4fr_1fr_1fr_auto]" action="/admin/majors">
        <div>
          <label className="label">搜索专业</label>
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
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="sticky top-0 bg-[#eef0f4] text-xs font-bold uppercase text-slate-600">
              <tr>
                <th className="border-b border-slate-300 px-4 py-3">专业名称</th>
                <th className="border-b border-slate-300 px-4 py-3">适用区域</th>
                <th className="border-b border-slate-300 px-4 py-3">学生数</th>
                <th className="border-b border-slate-300 px-4 py-3">状态</th>
                <th className="border-b border-slate-300 px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {majors.map((major) => {
                const selectedRegionIds = major.regions.map((item) => item.regionId);
                return (
                  <tr key={major.id} className="align-top hover:bg-slate-50">
                    <td className="px-4 py-4">
                      <p className="font-semibold">{major.name}</p>
                      {major.description ? <p className="mt-1 text-xs text-slate-500">{major.description}</p> : null}
                    </td>
                    <td className="px-4 py-4 text-slate-600">{major.regions.length ? major.regions.map((item) => item.region.name).join("、") : "未绑定"}</td>
                    <td className="px-4 py-4 text-slate-700">{major._count.studentProfiles}</td>
                    <td className="px-4 py-4">
                      <form action={cycleMajorStatus}>
                        <input type="hidden" name="id" value={major.id} />
                        <button className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(major.status)}`} type="submit">
                          {statusText(major.status)}
                        </button>
                      </form>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <details className="inline-block text-left">
                        <summary className="cursor-pointer list-none text-sm font-semibold text-[#0869a9] [&::-webkit-details-marker]:hidden">编辑</summary>
                        <form action={updateMajor} className="absolute right-10 z-10 mt-2 grid w-[560px] gap-3 border border-slate-300 bg-white p-4 text-left shadow-xl">
                          <input type="hidden" name="id" value={major.id} />
                          <input className="input rounded-none" name="name" defaultValue={major.name} required />
                          <select className="input min-h-24 rounded-none" name="regionIds" multiple defaultValue={selectedRegionIds} required>
                            {regions.map((region) => (
                              <option key={region.id} value={region.id}>{region.name}</option>
                            ))}
                          </select>
                          <input className="input rounded-none" name="description" defaultValue={major.description || ""} />
                          <div className="grid grid-cols-[1fr_auto] gap-3">
                            <select className="input rounded-none" name="status" defaultValue={major.status}>
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
          <span>当前显示 1 至 {majors.length} 条，共 {majors.length} 条</span>
          <span className="bg-[#0872b9] px-3 py-1 font-bold text-white">1</span>
        </div>
      </section>
    </main>
  );
}
