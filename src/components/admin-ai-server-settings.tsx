import { Save } from "lucide-react";
import { updateAiModuleRouteSettings } from "@/app/admin/actions";
import { AdminAiServerManager } from "@/components/admin-ai-server-manager";
import { AdminAiModuleServerSelector } from "@/components/admin-ai-module-server-selector";
import type { AdminAiServerSettings } from "@/lib/ai-server-settings";

export function AdminAiServerSettingsPanel({ settings }: { settings: AdminAiServerSettings }) {
  const serverOptions = [settings.builtIn, ...settings.customServers];
  const routeServerOptions = serverOptions
    .filter((server) => server.enabled)
    .map(({ id, name, enabled }) => ({ id, name, enabled }));
  const groups = Array.from(new Set(settings.moduleRoutes.map((route) => route.group)));

  return (
    <div className="space-y-5">
      <AdminAiServerManager builtIn={settings.builtIn} customServers={settings.customServers} />

      <form action={updateAiModuleRouteSettings} className="border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-lg font-black text-ink">AI 模块分配</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">每个模块至少选择一台启用服务器；多选按勾选顺序轮询，且尚未输出内容时失败会尝试下一台。</p>
          </div>
          <button className="primary-button rounded-none" type="submit"><Save size={16} />保存模块分配</button>
        </div>

        <div className="mt-5 space-y-5">
          {groups.map((group, index) => {
            const routes = settings.moduleRoutes.filter((route) => route.group === group);
            return (
              <details className="border border-slate-200 bg-white" key={group} open={index === 0}>
                <summary className="flex cursor-pointer items-center justify-between gap-3 bg-slate-50 px-4 py-3 text-sm font-black text-ink">
                  <span>{group}</span>
                  <span className="bg-white px-2 py-1 text-xs font-bold text-slate-500">{routes.length} 个模块</span>
                </summary>
                <div className="grid items-start gap-3 p-3 lg:grid-cols-2">
                  {routes.map((route) => (
                    <fieldset className="border border-slate-200 bg-slate-50 p-3" key={route.key}>
                      <legend className="px-1 text-sm font-black text-slate-700">{route.label}</legend>
                      <AdminAiModuleServerSelector
                        initialServerIds={route.serverIds}
                        moduleKey={route.key}
                        servers={routeServerOptions}
                      />
                    </fieldset>
                  ))}
                </div>
              </details>
            );
          })}
        </div>

        <div className="mt-5 border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold leading-5 text-amber-800">
          管理员预设答案、已有缓存或历史结果仍然优先直接返回，不调用任何 AI 服务器。只有确实需要新生成内容时，才会按上述模块分配调用对应服务器。
        </div>
      </form>
    </div>
  );
}
