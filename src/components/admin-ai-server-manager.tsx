"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Save, Search, Server, Trash2, X } from "lucide-react";
import {
  deleteAiServerProfileSettings,
  saveAiServerProfileSettings
} from "@/app/admin/actions";
import type { AdminAiServerProfile } from "@/lib/ai-server-settings";

type BuiltInServer = AdminAiServerProfile;
type StatusFilter = "all" | "enabled" | "disabled";

function KeyStatus({ configured }: { configured: boolean }) {
  return (
    <span className={configured ? "font-bold text-teal" : "font-bold text-slate-500"}>
      {configured ? "Key 已配置" : "Key 未配置"}
    </span>
  );
}

function ServerFields({ server }: { server?: AdminAiServerProfile }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {server ? <input name="serverId" type="hidden" value={server.id} /> : null}
      <label>
        <span className="label">配置名称</span>
        <input className="input w-full rounded-none" defaultValue={server?.name || ""} maxLength={80} name="name" placeholder="例如：自定义服务器 A" required />
      </label>
      <label>
        <span className="label">模型 ID</span>
        <input className="input w-full rounded-none" defaultValue={server?.model || ""} maxLength={160} name="model" placeholder="例如：deepseek-chat 或 glm-4-plus" required />
      </label>
      <label className="sm:col-span-2">
        <span className="label">API Base URL（IP / 域名）</span>
        <input className="input w-full rounded-none" defaultValue={server?.baseUrl || ""} maxLength={1000} name="baseUrl" placeholder="https://api.deepseek.com/v1" required type="url" />
        <span className="mt-1.5 block text-xs font-semibold text-slate-500">填写到 API 版本路径即可，不要包含 /chat/completions。</span>
      </label>
      <label>
        <span className="label">API Key</span>
        <input
          autoComplete="new-password"
          className="input w-full rounded-none"
          maxLength={8192}
          name="apiKey"
          placeholder={server?.apiKeyConfigured ? "已保存；留空保持不变" : "请输入 API Key；无鉴权服务可留空"}
          type="password"
        />
      </label>
      <div className="flex flex-col justify-end gap-3 pb-1 text-sm font-semibold text-slate-600">
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

function getHost(baseUrl: string) {
  if (!baseUrl) return "地址未配置";
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
}

export function AdminAiServerManager({
  builtIn,
  customServers
}: {
  builtIn: BuiltInServer;
  customServers: AdminAiServerProfile[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [editingServer, setEditingServer] = useState<AdminAiServerProfile | null>(null);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const isOpen = creating || editingServer !== null;

  const matchesFilter = (server: AdminAiServerProfile) => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const matchesQuery = !normalizedQuery || [server.name, server.model, server.baseUrl]
      .some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
    const matchesStatus = statusFilter === "all" || (statusFilter === "enabled" ? server.enabled : !server.enabled);
    return matchesQuery && matchesStatus;
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) dialog.showModal();
    if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);

  const visibleServers = useMemo(() => {
    return customServers.filter((server) => {
      const normalizedQuery = query.trim().toLocaleLowerCase();
      const matchesQuery = !normalizedQuery || [server.name, server.model, server.baseUrl]
        .some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
      const matchesStatus = statusFilter === "all" || (statusFilter === "enabled" ? server.enabled : !server.enabled);
      return matchesQuery && matchesStatus;
    });
  }, [customServers, query, statusFilter]);

  const enabledCount = customServers.filter((server) => server.enabled).length;
  const showBuiltIn = matchesFilter(builtIn);

  return (
    <section className="border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-lg font-black text-ink">AI 服务器列表</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">管理内置服务器和兼容 OpenAI Chat Completions 的自定义服务器。</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
            <span className="bg-slate-100 px-2.5 py-1.5 text-slate-600">共 {customServers.length + 1} 台</span>
            <span className="bg-teal/10 px-2.5 py-1.5 text-teal">{enabledCount + (builtIn.enabled ? 1 : 0)} 台已启用</span>
          </div>
        </div>
        <button
          className="primary-button rounded-none"
          onClick={() => { setEditingServer(null); setCreating(true); }}
          type="button"
        >
          <Plus size={16} />新增服务器
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <label className="relative block">
          <span className="sr-only">搜索服务器</span>
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            className="input w-full rounded-none pl-9"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索名称、模型或地址"
            type="search"
            value={query}
          />
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-600">
          <span className="sr-only">按启用状态筛选</span>
          <select className="input min-w-32 rounded-none" onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} value={statusFilter}>
            <option value="all">全部状态</option>
            <option value="enabled">仅看已启用</option>
            <option value="disabled">仅看已停用</option>
          </select>
        </label>
      </div>

      <div className="mt-3 divide-y divide-slate-100 border border-slate-200">
        {showBuiltIn ? <div className="grid gap-3 bg-teal/5 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="flex min-w-0 items-start gap-3">
            <Server aria-hidden="true" className="mt-0.5 shrink-0 text-teal" size={18} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-black text-ink">{builtIn.name}</span>
                <span className="bg-teal/10 px-2 py-0.5 text-xs font-bold text-teal">系统内置</span>
                <span className={builtIn.enabled ? "bg-teal/10 px-2 py-0.5 text-xs font-bold text-teal" : "bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500"}>
                  {builtIn.enabled ? "已启用" : "已停用"}
                </span>
              </div>
              <p className="mt-1 truncate text-xs font-semibold text-slate-500">{builtIn.model || "模型未配置"} · {getHost(builtIn.baseUrl)}</p>
            </div>
          </div>
          <div className="pl-8 text-xs sm:pl-0"><KeyStatus configured={builtIn.apiKeyConfigured} /></div>
        </div> : null}

        {visibleServers.map((server) => (
          <div className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center" key={server.id}>
            <div className="flex min-w-0 items-start gap-3">
              <Server aria-hidden="true" className="mt-0.5 shrink-0 text-slate-400" size={18} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-black text-ink">{server.name}</span>
                  <span className={server.enabled ? "bg-teal/10 px-2 py-0.5 text-xs font-bold text-teal" : "bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500"}>
                    {server.enabled ? "已启用" : "已停用"}
                  </span>
                </div>
                <p className="mt-1 truncate text-xs font-semibold text-slate-500">{server.model} · {getHost(server.baseUrl)}</p>
              </div>
            </div>
            <div className="pl-8 text-xs sm:pl-0"><KeyStatus configured={server.apiKeyConfigured} /></div>
            <button
              className="secondary-button min-h-10 rounded-none px-3 py-2"
              onClick={() => { setCreating(false); setEditingServer(server); }}
              type="button"
            >
              编辑
            </button>
          </div>
        ))}

        {visibleServers.length === 0 && !showBuiltIn ? (
          <p className="px-4 py-6 text-center text-sm font-semibold text-slate-500">
            {customServers.length === 0 ? "还没有自定义服务器，点击“新增服务器”开始配置。" : "没有符合条件的服务器。"}
          </p>
        ) : null}
      </div>

      <dialog
        aria-labelledby="ai-server-editor-title"
        className="fixed inset-y-0 left-auto right-0 m-0 h-full max-h-none w-full max-w-2xl border-0 bg-white p-0 shadow-2xl backdrop:bg-slate-950/40"
        onClose={() => { setCreating(false); setEditingServer(null); }}
        onCancel={() => { setCreating(false); setEditingServer(null); }}
        ref={dialogRef}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-7">
            <div>
              <h3 className="text-lg font-black text-ink" id="ai-server-editor-title">{creating ? "新增自定义 AI 服务器" : "编辑 AI 服务器"}</h3>
              <p className="mt-1 text-sm font-semibold text-slate-500">服务器列表保持简洁，配置详情在此编辑。</p>
            </div>
            <button aria-label="关闭" className="grid h-10 w-10 shrink-0 place-items-center border border-slate-200 text-slate-600 hover:bg-slate-50" onClick={() => dialogRef.current?.close()} type="button">
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-7">
            <form action={saveAiServerProfileSettings} className="space-y-5">
              <ServerFields server={editingServer || undefined} />
              <div className="sticky bottom-0 -mx-5 border-t border-slate-200 bg-white px-5 py-4 sm:-mx-7 sm:px-7">
                <div className="flex justify-end gap-3">
                  <button className="secondary-button rounded-none" onClick={() => dialogRef.current?.close()} type="button">取消</button>
                  <button className="primary-button rounded-none" type="submit"><Save size={16} />{creating ? "新增服务器" : "保存更改"}</button>
                </div>
              </div>
            </form>
            {editingServer ? (
              <details className="mt-5 border-t border-slate-100 pt-4 text-sm font-semibold text-slate-500">
                <summary className="cursor-pointer select-none text-red-700">删除服务器配置</summary>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 bg-red-50 p-3 text-red-700">
                  <span>确认删除？正在被 AI 模块使用的服务器不会被删除。</span>
                  <form action={deleteAiServerProfileSettings}>
                    <input name="serverId" type="hidden" value={editingServer.id} />
                    <button className="inline-flex min-h-10 items-center gap-1 border border-red-200 bg-white px-3 py-2 font-black" type="submit"><Trash2 size={14} />确认删除</button>
                  </form>
                </div>
              </details>
            ) : null}
          </div>
        </div>
      </dialog>
    </section>
  );
}
