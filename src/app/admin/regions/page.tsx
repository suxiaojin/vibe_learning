import { RegionStatus, type Prisma } from "@prisma/client";
import { Filter, Plus } from "lucide-react";
import { createRegion, toggleRegionStatus, updateRegion } from "@/app/admin/actions";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const regionStatuses = new Set<string>(Object.values(RegionStatus));

function regionStatusText(status: RegionStatus) {
  return status === "active" ? "启用" : "停用";
}

export default async function RegionsPage({
  searchParams
}: {
  searchParams?: Promise<{ province?: string; status?: string; keyword?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const province = params?.province?.trim() || "";
  const selectedStatus = regionStatuses.has(params?.status || "") ? params?.status || "" : "";
  const keyword = params?.keyword?.trim() || "";

  const where: Prisma.RegionWhereInput = {
    ...(province ? { province } : {}),
    ...(selectedStatus ? { status: selectedStatus as RegionStatus } : {}),
    ...(keyword ? { name: { contains: keyword, mode: "insensitive" } } : {})
  };

  const [regions, provinces] = await Promise.all([
    prisma.region.findMany({
      where,
      include: {
        _count: { select: { publicSubjects: true, majors: true, studentProfiles: true } }
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }]
    }),
    prisma.region.findMany({
      distinct: ["province"],
      select: { province: true },
      orderBy: { province: "asc" }
    })
  ]);

  return (
    <main>
      <details className="group relative">
        <summary className="absolute right-0 top-0 flex h-10 cursor-pointer list-none items-center gap-2 bg-[#0872b9] px-6 text-sm font-bold text-white transition hover:bg-[#0767a8] [&::-webkit-details-marker]:hidden">
          <Plus size={16} />
          新增区域
        </summary>
        <div className="mb-7 pr-44">
          <div>
            <h1 className="text-2xl font-black tracking-normal">区域管理</h1>
            <p className="mt-2 text-sm text-slate-500">管理学生注册时可选择的省份、学制与考试体系。</p>
          </div>
        </div>

        <form action={createRegion} className="mb-6 hidden border border-slate-300 bg-white p-4 shadow-sm group-open:grid group-open:gap-4 lg:grid-cols-[160px_160px_1fr_140px_auto] lg:items-end">
          <div>
            <label className="label">省份</label>
            <input className="input rounded-none" name="province" placeholder="江苏" required />
          </div>
          <div>
            <label className="label">学制</label>
            <input className="input rounded-none" name="studySystem" placeholder="三年制" required />
          </div>
          <div>
            <label className="label">区域说明</label>
            <input className="input rounded-none" name="description" placeholder="面向江苏三年制专转本学生" />
          </div>
          <div>
            <label className="label">状态</label>
            <select className="input rounded-none" name="status" defaultValue="active">
              <option value="active">启用</option>
              <option value="inactive">停用</option>
            </select>
          </div>
          <button className="primary-button rounded-none" type="submit">保存</button>
        </form>
      </details>

      <form className="mb-6 grid gap-4 border border-slate-300 bg-white p-4 shadow-sm lg:grid-cols-[1.4fr_1fr_1fr_auto]" action="/admin/regions">
        <div>
          <label className="label">搜索区域</label>
          <input className="input rounded-none" name="keyword" defaultValue={keyword} placeholder="按名称或关键词搜索..." />
        </div>
        <div>
          <label className="label">省份</label>
          <select className="input rounded-none" name="province" defaultValue={province}>
            <option value="">全部省份</option>
            {provinces.map((item) => (
              <option key={item.province} value={item.province}>{item.province}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">状态</label>
          <select className="input rounded-none" name="status" defaultValue={selectedStatus}>
            <option value="">全部状态</option>
            <option value="active">启用</option>
            <option value="inactive">停用</option>
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
                <th className="border-b border-slate-300 px-4 py-3">区域名称</th>
                <th className="border-b border-slate-300 px-4 py-3">省份</th>
                <th className="border-b border-slate-300 px-4 py-3">学制</th>
                <th className="border-b border-slate-300 px-4 py-3">关联内容</th>
                <th className="border-b border-slate-300 px-4 py-3">状态</th>
                <th className="border-b border-slate-300 px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {regions.map((region) => (
                <tr key={region.id} className="align-top hover:bg-slate-50">
                  <td className="px-4 py-4">
                    <p className="font-semibold">{region.name}</p>
                    <p className="mt-1 text-xs text-slate-500">排序 {region.sortOrder}</p>
                  </td>
                  <td className="px-4 py-4 text-slate-700">{region.province}</td>
                  <td className="px-4 py-4 text-slate-700">{region.studySystem}</td>
                  <td className="px-4 py-4 text-slate-600">
                    公共课 {region._count.publicSubjects} · 专业 {region._count.majors} · 学生 {region._count.studentProfiles}
                  </td>
                  <td className="px-4 py-4">
                    <form action={toggleRegionStatus}>
                      <input type="hidden" name="id" value={region.id} />
                      <button
                        className={region.status === "active" ? "rounded-full bg-lime-300 px-3 py-1 text-xs font-semibold text-lime-800" : "rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-600"}
                        type="submit"
                      >
                        {regionStatusText(region.status)}
                      </button>
                    </form>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <details className="inline-block text-left">
                      <summary className="cursor-pointer list-none text-sm font-semibold text-[#0869a9] [&::-webkit-details-marker]:hidden">编辑</summary>
                      <form action={updateRegion} className="absolute right-10 z-10 mt-2 grid w-[520px] gap-3 border border-slate-300 bg-white p-4 text-left shadow-xl">
                        <input type="hidden" name="id" value={region.id} />
                        <div className="grid grid-cols-2 gap-3">
                          <input className="input rounded-none" name="province" defaultValue={region.province} required />
                          <input className="input rounded-none" name="studySystem" defaultValue={region.studySystem} required />
                        </div>
                        <input className="input rounded-none" name="description" defaultValue={region.description || ""} />
                        <div className="grid grid-cols-[1fr_auto] gap-3">
                          <select className="input rounded-none" name="status" defaultValue={region.status}>
                            <option value="active">启用</option>
                            <option value="inactive">停用</option>
                          </select>
                          <button className="primary-button rounded-none" type="submit">保存</button>
                        </div>
                      </form>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <span>当前显示 1 至 {regions.length} 条，共 {regions.length} 条</span>
          <span className="bg-[#0872b9] px-3 py-1 font-bold text-white">1</span>
        </div>
      </section>
    </main>
  );
}
