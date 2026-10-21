"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function OverviewJobControl({ nodeId, status, autoRequest, fallbackOverviewHtml }: {
  nodeId: string;
  status: string;
  autoRequest: boolean;
  fallbackOverviewHtml: string;
}) {
  const router = useRouter();
  const autoRequestedNode = useRef<string | null>(null);
  const [currentStatus, setCurrentStatus] = useState(status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setCurrentStatus(status);
    setError("");
  }, [nodeId, status]);

  const requestOverview = useCallback(async (retry: boolean) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/ai-study/nodes/${nodeId}/overview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retry })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || "内容概述生成请求失败，请稍后重试。");
      const next = payload.data?.job?.status;
      if (typeof next === "string") setCurrentStatus(next);
      if (next === "succeeded") router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "内容概述生成请求失败，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }, [nodeId, router]);

  useEffect(() => {
    if (!autoRequest || (currentStatus !== "unrequested" && currentStatus !== "pending") || autoRequestedNode.current === nodeId) return;
    autoRequestedNode.current = nodeId;
    void requestOverview(false);
  }, [autoRequest, currentStatus, nodeId, requestOverview]);

  useEffect(() => {
    if (currentStatus !== "pending" && currentStatus !== "running") return;
    let stopped = false;
    const timer = setInterval(async () => {
      try {
        const response = await fetch(`/api/ai-study/nodes/${nodeId}/overview`, { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok || stopped) return;
        const next = payload.data?.job?.status;
        if (typeof next === "string" && next !== currentStatus) setCurrentStatus(next);
        if (next === "succeeded" || payload.data?.generated) router.refresh();
      } catch {
        // A later poll can recover from a transient connection error.
      }
    }, 4000);
    return () => { stopped = true; clearInterval(timer); };
  }, [currentStatus, nodeId, router]);

  const failed = currentStatus === "failed";
  if (failed || error) return <div className="text-sm">
    <p className="text-[16px] leading-8 text-[#1f2937]" dangerouslySetInnerHTML={{ __html: fallbackOverviewHtml }} />
    <p className="mt-2 text-[#667085]">概述暂未生成，当前显示目录简介。</p>
    <button type="button" disabled={busy} onClick={() => void requestOverview(failed)}
      className="mt-2 rounded-lg border border-[#d0d5dd] px-3 py-1.5 font-semibold text-[#344054] hover:bg-[#f9fafb] disabled:opacity-50">
      重试生成概述
    </button>
    {error ? <p role="alert" className="mt-2 text-red-600">{error}</p> : null}
  </div>;
  return <div role="status" aria-label="正在生成本节内容概述" className="w-full">
    <div aria-hidden="true" className="h-20 w-full rounded-2xl bg-[#e2eee8] motion-safe:animate-pulse md:h-24" />
    <p className="mt-2 text-sm text-[#667085]">正在整理本节内容概述，可先查看下方知识点。</p>
  </div>;
}
