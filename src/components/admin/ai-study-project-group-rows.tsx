"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";

export function AiStudyProjectGroupRows({
  title,
  ownerId,
  ownerName,
  ownerUsername,
  expectedPartCount,
  availablePartCount,
  learningReadyCount,
  failedCount,
  visibility,
  purchaseCount,
  createdAt,
  actions,
  children
}: {
  title: string;
  ownerId: string;
  ownerName: string;
  ownerUsername: string;
  expectedPartCount: number;
  availablePartCount: number;
  learningReadyCount: number;
  failedCount: number;
  visibility: string;
  purchaseCount: number;
  createdAt: string;
  actions: ReactNode;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  return <>
    <tr className="align-top bg-slate-50/70 text-slate-700">
      <td className="border-b border-slate-200 py-4 pr-4">
        <button
          aria-expanded={expanded}
          className="inline-flex items-start gap-2 text-left font-semibold text-ink hover:text-teal"
          onClick={() => setExpanded((value) => !value)}
          type="button"
        >
          <ChevronDown className={`mt-0.5 shrink-0 transition-transform ${expanded ? "" : "-rotate-90"}`} size={16} />
          <span>{title}</span>
        </button>
        <div className="ml-6 mt-1 text-xs text-slate-500">共 {expectedPartCount} 部分{availablePartCount !== expectedPartCount ? `，当前保留 ${availablePartCount} 部分` : ""}</div>
      </td>
      <td className="border-b border-slate-200 py-4 pr-4">
        <Link className="font-semibold text-ink hover:text-teal hover:underline" href={`/admin/students/${ownerId}`}>{ownerName}</Link>
        <div className="mt-1 text-xs text-slate-400">{ownerUsername}</div>
      </td>
      <td className="border-b border-slate-200 py-4 pr-4">
        <span className="badge bg-teal/10 text-teal">可学习 {learningReadyCount}/{availablePartCount}</span>
        {failedCount > 0 ? <div className="mt-1 text-xs font-semibold text-red-600">{failedCount} 部分生成失败</div> : null}
      </td>
      <td className="border-b border-slate-200 py-4 pr-4">
        <span className="badge bg-slate-100 text-slate-600">{visibility}</span>
      </td>
      <td className="border-b border-slate-200 py-4 pr-4">{purchaseCount} 人次<span className="block text-xs text-slate-400">各部分合计</span></td>
      <td className="border-b border-slate-200 py-4 pr-4">{createdAt}</td>
      <td className="border-b border-slate-200 py-4">{actions}</td>
    </tr>
    {expanded ? children : null}
  </>;
}
