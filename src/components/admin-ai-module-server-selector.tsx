"use client";

import { useState } from "react";
import type { AiModuleKey } from "@/lib/ai-server-settings";

type AiServerOption = {
  id: string;
  name: string;
  enabled: boolean;
};

export function AdminAiModuleServerSelector({
  moduleKey,
  servers,
  initialServerIds
}: {
  moduleKey: AiModuleKey;
  servers: AiServerOption[];
  initialServerIds: string[];
}) {
  const activeServers = servers.filter((server) => server.enabled);
  const [selectedServerIds, setSelectedServerIds] = useState(() => {
    const availableIds = new Set(activeServers.map((server) => server.id));
    return initialServerIds.filter(
      (serverId, index, values) => availableIds.has(serverId) && values.indexOf(serverId) === index
    );
  });
  const serversById = new Map(activeServers.map((server) => [server.id, server]));
  const orderedServers = selectedServerIds.flatMap((serverId) => {
    const server = serversById.get(serverId);
    return server ? [server] : [];
  });

  function updateSelection(serverId: string, checked: boolean) {
    setSelectedServerIds((current) => {
      if (checked) {
        return current.includes(serverId) ? current : [...current, serverId];
      }
      return current.filter((currentId) => currentId !== serverId);
    });
  }

  return (
    <div>
      {selectedServerIds.map((serverId) => (
        <input key={serverId} name={`route_${moduleKey}`} type="hidden" value={serverId} />
      ))}

      <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
        {activeServers.map((server) => {
          const checked = selectedServerIds.includes(server.id);
          return (
            <label className="flex min-h-9 items-center gap-2 bg-white px-2.5 py-1.5 text-sm font-semibold text-slate-700" key={server.id}>
              <input
                checked={checked}
                className="h-4 w-4 accent-teal"
                onChange={(event) => updateSelection(server.id, event.target.checked)}
                type="checkbox"
              />
              <span>{server.name}</span>
            </label>
          );
        })}
      </div>

      {activeServers.length === 0 ? (
        <p className="mt-2 border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">暂无启用服务器，请先在上方服务器列表中启用一台。</p>
      ) : selectedServerIds.length === 0 ? (
        <p className="mt-2 text-xs font-semibold text-amber-700">至少选择一台启用服务器。</p>
      ) : null}

      {orderedServers.length > 1 ? (
        <div className="mt-3 border-t border-slate-200 pt-3 text-xs font-bold text-slate-500">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-slate-600">待保存轮询顺序</span>
            {orderedServers.map((server, index) => (
              <span className="inline-flex items-center gap-1.5" key={server.id}>
                {index > 0 ? <span className="text-slate-300">→</span> : null}
                <span className={index === 0 ? "border border-teal/20 bg-teal/10 px-2 py-1 text-teal" : "border border-slate-200 bg-white px-2 py-1 text-slate-600"}>
                  {index + 1}. {server.name}
                </span>
              </span>
            ))}
          </div>
          <p className="mt-2 font-semibold text-slate-400">按勾选顺序轮询；取消后重选会移到最后。</p>
        </div>
      ) : null}
    </div>
  );
}
