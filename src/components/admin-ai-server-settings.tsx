import { Plus, Save, Server, Trash2 } from "lucide-react";
import {
  deleteAiServerProfileSettings,
  saveAiServerProfileSettings,
  updateAiModuleRouteSettings
} from "@/app/admin/actions";
import { AdminAiModuleServerSelector } from "@/components/admin-ai-module-server-selector";
import type { AdminAiServerProfile, AdminAiServerSettings } from "@/lib/ai-server-settings";

function KeyStatus({ configured }: { configured: boolean }) {
  return (
    <span className={configured ? "font-black text-teal" : "font-black text-slate-500"}>
      {configured ? "已配置（不回显）" : "未配置"}
    </span>
  );
}

function CustomServerFields({ server }: { server?: AdminAiServerProfile }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {server ? <input name="serverId" type="hidden" value={server.id} /> : null}
      <label>
        <span className="label">配置名称</span>
        <input className="input rounded-none" defaultValue={server?.name || ""} maxLength={80} name="name" placeholder="例如：自定义服务器 A" required />
      </label>
      <label>
        <span className="label">模型 ID</span>
        <input className="input rounded-none" defaultValue={server?.model || ""} maxLength={160} name="model" placeholder="例如：deepseek-chat 或 glm-4-plus" required />
      </label>
      <label className="md:col-span-2">
        <span className="label">API Base URL（IP / 域名）</span>
        <input className="input rounded-none" defaultValue={server?.baseUrl || ""} maxLength={1000} name="baseUrl" placeholder="https://api.deepseek.com/v1" required type="url" />
        <span className="mt-1.5 block text-xs font-semibold text-slate-500">填写到 API 版本路径即可，不要包含 /chat/completions。</span>
      </label>
      <label>
        <span className="label">API Key</span>
        <input
          autoComplete="new-password"
          className="input rounded-none"
          maxLength={8192}
          name="apiKey"
          placeholder={server?.apiKeyConfigured ? "已保存；留空保持不变" : "请输入 API Key；无鉴权服务可留空"}
          type="password"
        />
      </label>
      <div className="flex flex-col justify-end gap-2 pb-1 text-xs font-bold text-slate-600">
        <label className="flex items-center gap-2">
          <input className="h-4 w-4 accent-teal" defaultChecked={server?.enabled ?? true} name="enabled" type="checkbox" value="true" />
          启用此服务器
        </label>
        {server?.apiKeyConfigured ? (
          <label className="flex items-center gap-2">
            <input className="h-4 w-4 accent-red-500" name="clearApiKey" type="checkbox" value="true" />
            清除已保存的 API Key
          </label>
        ) : null}
      </div>
    </div>
  );
}

export function AdminAiServerSettingsPanel({ settings }: { settings: AdminAiServerSettings }) {
  const serverOptions = [settings.builtIn, ...settings.customServers];
  const routeServerOptions = serverOptions.map(({ id, name, enabled }) => ({ id, name, enabled }));
  const groups = Array.from(new Set(settings.moduleRoutes.map((route) => route.group)));

  return (
    <div className="space-y-5">
      <section className="border border-slate-200 bg-white p-5 shadow-sm">
        <div className="border-b border-slate-100 pb-4">
          <h2 className="text-lg font-black text-ink">AI 服务器列表</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">保留内置服务器，并可增加多个兼容 OpenAI Chat Completions 的自定义服务器。</p>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <section className="border border-teal/20 bg-teal/5 p-4">
            <div className="flex items-center gap-2">
              <Server className="text-teal" size={18} />
              <h3 className="font-black text-ink">{settings.builtIn.name}</h3>
              <span className="ml-auto bg-teal/10 px-2 py-1 text-xs font-black text-teal">系统内置</span>
            </div>
            <dl className="mt-4 grid gap-3 text-sm font-semibold text-slate-600">
              <div><dt className="text-xs font-black text-slate-400">API Base URL</dt><dd className="mt-1 break-all">{settings.builtIn.baseUrl || "未配置"}</dd></div>
              <div><dt className="text-xs font-black text-slate-400">模型 ID</dt><dd className="mt-1 break-all">{settings.builtIn.model || "未配置"}</dd></div>
              <div><dt className="text-xs font-black text-slate-400">API Key</dt><dd className="mt-1"><KeyStatus configured={settings.builtIn.apiKeyConfigured} /></dd></div>
            </dl>
          </section>

          {settings.customServers.map((server) => (
            <section className="border border-slate-200 bg-white p-4" key={server.id}>
              <div className="mb-4 flex items-center gap-2">
                <Server className="text-slate-500" size={18} />
                <h3 className="font-black text-ink">{server.name}</h3>
                <span className={server.enabled ? "ml-auto bg-teal/10 px-2 py-1 text-xs font-black text-teal" : "ml-auto bg-slate-100 px-2 py-1 text-xs font-black text-slate-500"}>
                  {server.enabled ? "已启用" : "已停用"}
                </span>
              </div>
              <form action={saveAiServerProfileSettings}>
                <CustomServerFields server={server} />
                <div className="mt-4 flex justify-end">
                  <button className="secondary-button rounded-none" type="submit"><Save size={15} />保存此服务器</button>
                </div>
              </form>
              <details className="mt-3 border-t border-slate-100 pt-3 text-xs font-semibold text-slate-500">
                <summary className="cursor-pointer select-none">删除服务器配置</summary>
                <form action={deleteAiServerProfileSettings} className="mt-3 flex items-center justify-between gap-3 bg-red-50 p-3 text-red-700">
                  <input name="serverId" type="hidden" value={server.id} />
                  <span>确认删除？正在被 AI 模块使用的服务器不会被删除。</span>
                  <button className="inline-flex shrink-0 items-center gap-1 border border-red-200 bg-white px-3 py-2 font-black" type="submit"><Trash2 size={14} />确认删除</button>
                </form>
              </details>
            </section>
          ))}

          <section className="border border-dashed border-slate-300 bg-slate-50 p-4">
            <div className="mb-4 flex items-center gap-2">
              <Plus className="text-teal" size={18} />
              <h3 className="font-black text-ink">新增自定义 AI 服务器</h3>
            </div>
            <form action={saveAiServerProfileSettings}>
              <CustomServerFields />
              <div className="mt-4 flex justify-end">
                <button className="primary-button rounded-none" type="submit"><Plus size={15} />新增服务器</button>
              </div>
            </form>
          </section>
        </div>
      </section>

      <form action={updateAiModuleRouteSettings} className="border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-lg font-black text-ink">AI 模块分配</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">每个模块至少选择一台服务器，勾选先后决定轮询顺序。多选后没有固定首选：第 1 台是轮询起点，后续新请求依次轮换；课程闯关、专项练习和问问搭子调用失败且尚未输出内容时，会继续尝试其余服务器。</p>
          </div>
          <button className="primary-button rounded-none" type="submit"><Save size={16} />保存模块分配</button>
        </div>

        <div className="mt-5 space-y-5">
          {groups.map((group) => (
            <section key={group}>
              <h3 className="mb-2 text-sm font-black text-ink">{group}</h3>
              <div className="grid gap-3 lg:grid-cols-2">
                {settings.moduleRoutes.filter((route) => route.group === group).map((route) => (
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
            </section>
          ))}
        </div>

        <div className="mt-5 border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold leading-5 text-amber-800">
          管理员预设答案、已有缓存或历史结果仍然优先直接返回，不调用任何 AI 服务器。只有确实需要新生成内容时，才会按上述模块分配调用对应服务器。
        </div>
      </form>
    </div>
  );
}
