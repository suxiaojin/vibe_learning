"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { getStudyProjectPurchaseUsers } from "@/app/admin/ai-study-projects/purchase-actions";
import type { AdminProjectPurchasersPage } from "@/lib/admin-study-project-purchases";
import type { ProjectDiamondPriceKind } from "@/lib/project-diamond-price";

export function ProjectPurchaseUsers({
  kind,
  projectId,
  title,
  purchaseCount
}: {
  kind: ProjectDiamondPriceKind;
  projectId: string;
  title: string;
  purchaseCount: number;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const requestRef = useRef(0);
  const requestedPageRef = useRef(1);
  const id = useId();
  const [count, setCount] = useState(purchaseCount);
  const [data, setData] = useState<AdminProjectPurchasersPage | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { setCount(purchaseCount); }, [purchaseCount]);
  useEffect(() => () => { requestRef.current += 1; }, []);

  async function loadPage(page: number) {
    const request = ++requestRef.current;
    requestedPageRef.current = page;
    setIsLoading(true);
    setError("");
    try {
      const result = await getStudyProjectPurchaseUsers({ kind, id: projectId, page });
      if (request !== requestRef.current || !dialogRef.current?.open) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setData(result.data);
      setCount(result.data.totalCount);
    } catch {
      if (request === requestRef.current && dialogRef.current?.open) {
        setError("购买用户加载失败，请稍后重试。");
      }
    } finally {
      if (request === requestRef.current) setIsLoading(false);
    }
  }

  function openDialog() {
    setData(null);
    dialogRef.current?.showModal();
    void loadPage(1);
  }

  return (
    <>
      <button
        aria-haspopup="dialog"
        aria-label={`查看《${title}》的购买用户，${count} 人`}
        className="rounded px-1 py-1 font-semibold tabular-nums text-teal underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
        onClick={openDialog}
        type="button"
      >
        {count} 人
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-project`}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 text-ink shadow-2xl backdrop:bg-black/50 sm:p-6"
        onClose={() => { requestRef.current += 1; setIsLoading(false); }}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) {
            event.currentTarget.close();
          }
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold" id={`${id}-title`}>购买用户</h2>
          <button aria-label="关闭购买用户列表" className="grid size-9 shrink-0 place-items-center rounded-full hover:bg-slate-100" onClick={() => dialogRef.current?.close()} type="button"><X size={20} /></button>
        </div>
        <p className="mt-2 break-words text-sm text-slate-600" id={`${id}-project`}>{data?.projectTitle || title}</p>
        <p className="mt-2 text-sm text-slate-500">共 {count} 人</p>
        <div aria-busy={isLoading} className="mt-4 min-h-28">
          {isLoading ? (
            <p className="py-8 text-center text-sm text-slate-500" role="status">正在加载购买用户...</p>
          ) : error ? (
            <div className="py-6 text-center">
              <p className="text-sm text-red-700" role="alert">{error}</p>
              <button className="secondary-button mt-3" onClick={() => void loadPage(requestedPageRef.current)} type="button">重试</button>
            </div>
          ) : data?.users.length ? (
            <table className="w-full text-left text-sm">
              <thead className="text-slate-500"><tr><th className="border-b border-slate-200 py-3 pr-3 font-semibold">用户名</th><th className="border-b border-slate-200 py-3 font-semibold">购买时间</th></tr></thead>
              <tbody>
                {data.users.map((user) => (
                  <tr key={user.userId}>
                    <td className="max-w-[220px] break-all border-b border-slate-100 py-3 pr-3">
                      <Link className="font-semibold text-teal hover:underline" href={`/admin/students/${encodeURIComponent(user.userId)}`} onClick={() => dialogRef.current?.close()} prefetch={false}>{user.username}</Link>
                    </td>
                    <td className="whitespace-nowrap border-b border-slate-100 py-3 text-xs text-slate-600 sm:text-sm"><time dateTime={user.purchasedAt}>{formatPurchaseTime(user.purchasedAt)}</time></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="py-8 text-center text-sm text-slate-500">暂无购买用户。</p>
          )}
        </div>
        {!isLoading && !error && data && data.totalPages > 1 ? (
          <nav aria-label="购买用户分页" className="mt-5 flex items-center justify-between gap-3 text-sm">
            <button className="secondary-button px-3 disabled:opacity-50" disabled={data.page <= 1} onClick={() => void loadPage(data.page - 1)} type="button">上一页</button>
            <span className="text-slate-500">{data.page} / {data.totalPages}</span>
            <button className="secondary-button px-3 disabled:opacity-50" disabled={data.page >= data.totalPages} onClick={() => void loadPage(data.page + 1)} type="button">下一页</button>
          </nav>
        ) : null}
      </dialog>
    </>
  );
}

function formatPurchaseTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  });
}
