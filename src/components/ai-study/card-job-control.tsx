"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export function CardJobControl({ nodeId, status, canRequest }: { nodeId: string; status: string; canRequest: boolean }) {
  const router = useRouter();
  const [currentStatus, setCurrentStatus] = useState(status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => setCurrentStatus(status), [status, nodeId]);

  useEffect(() => {
    if (!["pending", "running"].includes(currentStatus)) return;
    let stopped = false;
    const timer = setInterval(async () => {
      try {
        const response = await fetch(`/api/ai-study/nodes/${nodeId}`, { cache: "no-store" });
        const payload = await response.json();
        const node = payload.data?.node;
        if (!stopped && response.ok && (node?.card || node?.cardJob?.status !== currentStatus)) router.refresh();
      } catch {
        // The next poll can recover from a transient connection error.
      }
    }, 5000);
    return () => { stopped = true; clearInterval(timer); };
  }, [nodeId, currentStatus, router]);

  async function requestCard(retry: boolean) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/ai-study/nodes/${nodeId}/card`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retry })
      });
      if (!response.ok) throw new Error(retry ? "重试请求失败，请稍后再试。" : "生成请求失败，请稍后再试。");
      const payload = await response.json();
      if (payload.data?.job?.status) setCurrentStatus(payload.data.job.status);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "请求失败，请稍后再试。");
    } finally {
      setBusy(false);
    }
  }

  const loading = busy || currentStatus === "pending" || currentStatus === "running";
  const canGenerate = canRequest && currentStatus === "unrequested";
  const canRetry = canRequest && ["failed", "paused"].includes(currentStatus);
  const showButton = canGenerate || canRetry || (canRequest && loading);
  const description = currentStatus === "unrequested"
    ? "需要时再生成本知识点的详解。原文可先阅读。"
    : currentStatus === "failed"
      ? "本知识点详解生成失败，其他内容仍可学习。"
      : currentStatus === "paused"
        ? "本知识点详解已暂停，原文仍可阅读。"
        : "详解已生成，请刷新页面查看。";

  return <section className="mt-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h4 className="relative pb-2 text-[19px] font-black text-[#101828] after:absolute after:bottom-0 after:left-0 after:h-[3px] after:w-8 after:rounded-full after:bg-[#101828]">AI详解</h4>
      {showButton ? <button
        type="button"
        disabled={loading}
        aria-busy={loading}
        onClick={() => void requestCard(canRetry)}
        className={`inline-flex min-h-12 min-w-40 items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-base font-bold transition ${loading
          ? "bg-[#9ee8d2] text-[#10251e] disabled:cursor-wait"
          : "bg-[#16a329] text-white hover:bg-[#118522]"}`}
      >{loading ? <><Loader2 className="animate-spin" size={20} aria-hidden="true" />生成中</> : canRetry ? "重试 AI 详解" : "生成 AI 详解"}</button> : null}
    </div>
    {loading ? (
      <div role="status" aria-label="AI 详解生成中" className="mt-4">
        <div aria-hidden="true" className="h-32 w-full rounded-2xl bg-[#e2eee8] motion-safe:animate-pulse md:h-40" />
      </div>
    ) : (
      <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{description}</p>
    )}
    {error ? <p role="alert" className="mt-2 text-sm text-red-600">{error}</p> : null}
  </section>;
}
