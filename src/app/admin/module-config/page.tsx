import { createAdminModule, updateAdminModule } from "@/app/admin/actions";
import { requireAdmin } from "@/lib/auth";
import { getAdminModules } from "@/lib/admin-modules";

const iconOptions = [
  { value: "dashboard", label: "仪表盘" },
  { value: "bell", label: "通知" },
  { value: "map", label: "区域" },
  { value: "book", label: "课程/题库" },
  { value: "database", label: "题库数据" },
  { value: "graduation", label: "专业" },
  { value: "project", label: "项目" },
  { value: "users", label: "学生" },
  { value: "settings", label: "设置" }
];

function statusOptions() {
  return (
    <>
      <option value="published">启用</option>
      <option value="draft">草稿</option>
      <option value="archived">停用</option>
    </>
  );
}

export default async function ModuleConfigPage() {
  await requireAdmin();
  const modules = await getAdminModules();
  const persisted = modules.every((item) => Boolean(item.id));

  return (
    <main className="grid gap-6 xl:grid-cols-[360px_1fr]">
      <section className="border border-slate-300 bg-white p-5 shadow-sm">
        <h1 className="text-xl font-black">配置管理</h1>
        <p className="mt-2 text-sm text-slate-500">新增或调整后台左侧功能模块。</p>
        {!persisted ? (
          <div className="mt-4 border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            当前显示的是默认模块。执行数据库迁移后，可以保存模块配置。
          </div>
        ) : null}
        <form action={createAdminModule} className="mt-5 grid gap-3">
          <div>
            <label className="label">模块名称</label>
            <input className="input rounded-none" name="label" placeholder="例如 题库管理" required />
          </div>
          <div>
            <label className="label">访问路径</label>
            <input className="input rounded-none" name="href" placeholder="/admin/questions" defaultValue="/admin/questions" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">图标</label>
              <select className="input rounded-none" name="icon" defaultValue="book">
                {iconOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">状态</label>
              <select className="input rounded-none" name="status" defaultValue="published">
                {statusOptions()}
              </select>
            </div>
          </div>
          <div>
            <label className="label">排序</label>
            <input className="input rounded-none" name="sortOrder" type="number" placeholder="留空自动追加" />
          </div>
          <button className="primary-button rounded-none" type="submit" disabled={!persisted}>新增模块</button>
        </form>
      </section>

      <section className="border border-slate-300 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-black">模块列表</h2>
        <div className="mt-5 space-y-3">
          {modules.map((item) => (
            <form key={item.key} action={updateAdminModule} className="grid gap-3 border border-slate-200 bg-slate-50 p-4 lg:grid-cols-[1.1fr_1.4fr_130px_120px_100px_auto] lg:items-end">
              <input type="hidden" name="id" value={item.id || ""} />
              <div>
                <label className="label">名称</label>
                <input className="input rounded-none" name="label" defaultValue={item.label} required />
              </div>
              <div>
                <label className="label">路径</label>
                <input className="input rounded-none" name="href" defaultValue={item.href} required />
              </div>
              <div>
                <label className="label">图标</label>
                <select className="input rounded-none" name="icon" defaultValue={item.icon}>
                  {iconOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">状态</label>
                <select className="input rounded-none" name="status" defaultValue={item.status}>
                  {statusOptions()}
                </select>
              </div>
              <div>
                <label className="label">排序</label>
                <input className="input rounded-none" name="sortOrder" type="number" defaultValue={item.sortOrder} />
              </div>
              <button className="secondary-button rounded-none" type="submit" disabled={!item.id}>保存</button>
            </form>
          ))}
        </div>
      </section>
    </main>
  );
}
