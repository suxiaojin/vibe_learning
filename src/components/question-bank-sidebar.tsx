"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronRight, Edit3, FileText, Folder, GripVertical, MoreVertical, Plus, Trash2 } from "lucide-react";
import { createQuestionBankOwner, createQuestionBankPaper, deleteQuestionBankOwner, deleteQuestionBankPaper, renameQuestionBankOwner, reorderQuestionBankOwners } from "@/app/admin/actions";
import { cn } from "@/lib/utils";
import type { QuestionBankOwnerType } from "@/lib/question-bank-catalog";

type RegionOption = {
  id: string;
  name: string;
};

export type QuestionBankSidebarOwner = {
  type: QuestionBankOwnerType;
  id: string;
  name: string;
  regions: RegionOption[];
};

export type QuestionBankSidebarPaper = {
  id: string;
  title: string;
};

type QuestionBankSidebarProps = {
  owners: QuestionBankSidebarOwner[];
  selectedOwnerKey: string;
  selectedPapers: QuestionBankSidebarPaper[];
  regions: RegionOption[];
};

function ownerKey(owner: Pick<QuestionBankSidebarOwner, "type" | "id">) {
  return `${owner.type}:${owner.id}`;
}

function ownerHref(owner: QuestionBankSidebarOwner) {
  return `/admin/question-banks?type=${owner.type}&id=${encodeURIComponent(owner.id)}&page=1`;
}

function ownerInputs(owner: QuestionBankSidebarOwner) {
  return (
    <>
      <input type="hidden" name="ownerType" value={owner.type} />
      <input type="hidden" name="ownerId" value={owner.id} />
    </>
  );
}

function firstRegionId(owner: QuestionBankSidebarOwner, fallbackRegions: RegionOption[]) {
  return owner.regions[0]?.id || fallbackRegions[0]?.id || "";
}

export function QuestionBankSidebar({ owners, selectedOwnerKey, selectedPapers, regions }: QuestionBankSidebarProps) {
  const [orderedOwners, setOrderedOwners] = useState(owners);
  const [expandedOwnerKeys, setExpandedOwnerKeys] = useState(() => new Set([selectedOwnerKey]));
  const draggedKeyRef = useRef<string>("");
  const orderInputRef = useRef<HTMLInputElement | null>(null);
  const reorderFormRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    setOrderedOwners(owners);
  }, [owners]);

  useEffect(() => {
    setExpandedOwnerKeys((current) => {
      const next = new Set(current);
      next.add(selectedOwnerKey);
      return next;
    });
  }, [selectedOwnerKey]);

  function toggleOwnerExpanded(key: string) {
    setExpandedOwnerKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function submitOrder(nextOwners: QuestionBankSidebarOwner[]) {
    if (!orderInputRef.current || !reorderFormRef.current) {
      return;
    }
    orderInputRef.current.value = nextOwners.map(ownerKey).join(",");
    reorderFormRef.current.requestSubmit();
  }

  function moveOwner(targetKey: string) {
    const draggedKey = draggedKeyRef.current;
    if (!draggedKey || draggedKey === targetKey) {
      return;
    }

    const from = orderedOwners.findIndex((owner) => ownerKey(owner) === draggedKey);
    const to = orderedOwners.findIndex((owner) => ownerKey(owner) === targetKey);
    if (from < 0 || to < 0) {
      return;
    }

    const nextOwners = [...orderedOwners];
    const [moved] = nextOwners.splice(from, 1);
    nextOwners.splice(to, 0, moved);
    setOrderedOwners(nextOwners);
    submitOrder(nextOwners);
  }

  return (
    <aside className="border-r border-[#d9dee7] bg-[#f5f7fb]">
      <form ref={reorderFormRef} action={reorderQuestionBankOwners} className="hidden">
        <input ref={orderInputRef} type="hidden" name="order" />
      </form>

      <div className="h-12 px-2 pt-2">
        <details className="relative inline-block">
          <summary className="grid size-8 cursor-pointer list-none place-items-center rounded border border-[#dce2eb] bg-white text-[#344054] shadow-sm hover:text-[#0872b9] [&::-webkit-details-marker]:hidden">
            <Plus size={18} />
          </summary>
          <form action={createQuestionBankOwner} className="absolute left-0 z-30 mt-2 grid w-[300px] gap-3 border border-[#cdd4df] bg-white p-4 shadow-xl">
            <div>
              <label className="label">专业名称</label>
              <input className="input rounded-none" name="name" placeholder="例如 大学数学" required />
            </div>
            <div>
              <label className="label">区域信息</label>
              <select className="input rounded-none" name="regionId" defaultValue={regions[0]?.id} required>
                {regions.map((region) => (
                  <option key={region.id} value={region.id}>{region.name}</option>
                ))}
              </select>
            </div>
            <button className="primary-button rounded-none" type="submit">保存</button>
          </form>
        </details>
      </div>

      <nav className="mt-1 px-2 pb-10 text-sm" aria-label="专业目录">
        {orderedOwners.map((owner) => {
          const currentOwnerKey = ownerKey(owner);
          const active = currentOwnerKey === selectedOwnerKey;
          const expanded = expandedOwnerKeys.has(currentOwnerKey);
          const rowRegions = owner.regions.length ? owner.regions : regions;
          return (
            <div
              key={currentOwnerKey}
              draggable
              onDragStart={() => {
                draggedKeyRef.current = currentOwnerKey;
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                moveOwner(currentOwnerKey);
              }}
              className="group"
            >
              <div
                className={cn(
                  "relative flex h-[38px] min-h-[38px] items-center gap-2 rounded-md px-2 transition",
                  active ? "bg-[#3f66f5] text-white" : "text-[#071b38] hover:bg-white"
                )}
              >
                <GripVertical size={14} className={cn("shrink-0 cursor-grab", active ? "text-white/70" : "text-slate-400 opacity-0 group-hover:opacity-100")} />
                <ChevronRight size={14} className={cn("shrink-0 transition", expanded ? "rotate-90" : "", active ? "text-white" : "text-[#2f3a4a]")} />
                <Folder size={16} className="shrink-0" />
                <Link
                  className="min-w-0 flex-1 truncate py-2 font-medium"
                  href={ownerHref(owner)}
                  onClick={(event) => {
                    if (active) {
                      event.preventDefault();
                      toggleOwnerExpanded(currentOwnerKey);
                    }
                  }}
                >
                  {owner.name}
                </Link>
                <details className="relative shrink-0">
                  <summary className={cn("grid size-7 cursor-pointer list-none place-items-center rounded hover:bg-black/5 [&::-webkit-details-marker]:hidden", active ? "text-white" : "text-slate-500")}>
                    <MoreVertical size={16} />
                  </summary>
                  <div className="absolute right-0 z-30 mt-2 w-[245px] rounded-lg bg-white p-3 text-[#071b38] shadow-2xl ring-1 ring-black/5">
                    <form action={renameQuestionBankOwner} className="grid gap-2 border-b border-slate-100 pb-3">
                      {ownerInputs(owner)}
                      <label className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                        <Edit3 size={14} />
                        重命名
                      </label>
                      <input className="input h-9 rounded-none text-xs" name="name" defaultValue={owner.name} required />
                      <button className="secondary-button h-8 min-h-8 rounded-none px-3 text-xs" type="submit">保存名称</button>
                    </form>
                    <form action={createQuestionBankPaper} className="mt-3 grid gap-2">
                      {ownerInputs(owner)}
                      <label className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                        <Plus size={14} />
                        添加题库
                      </label>
                      <input className="input h-9 rounded-none text-xs" name="title" placeholder="题库名称" required />
                      <div className="grid grid-cols-[1fr_78px] gap-2">
                        <select className="input h-9 rounded-none px-2 text-xs" name="regionId" defaultValue={firstRegionId(owner, regions)} required>
                          {rowRegions.map((region) => (
                            <option key={region.id} value={region.id}>{region.name}</option>
                          ))}
                        </select>
                        <input className="input h-9 rounded-none px-2 text-xs" name="year" type="number" min="2000" max="2100" placeholder="年份" />
                      </div>
                      <button className="primary-button h-8 min-h-8 rounded-none px-3 text-xs" type="submit">添加</button>
                    </form>
                    {owner.type === "major" ? (
                      <form
                        action={deleteQuestionBankOwner}
                        className="mt-3 border-t border-slate-100 pt-3"
                        onSubmit={(event) => {
                          if (!window.confirm("确认删除该专业及其课程、题库？此操作不可恢复。")) {
                            event.preventDefault();
                          }
                        }}
                      >
                        {ownerInputs(owner)}
                        <button className="flex h-8 w-full items-center gap-2 px-2 text-left text-xs font-semibold text-red-600 hover:bg-red-50" type="submit">
                          <Trash2 size={14} />
                          删除专业
                        </button>
                      </form>
                    ) : null}
                  </div>
                </details>
              </div>

              {active && expanded ? (
                <div className="space-y-1 py-2 pl-12 pr-2">
                  {selectedPapers.length > 0 ? selectedPapers.map((paper) => (
                    <div key={paper.id} className="group/paper flex items-start gap-1 rounded hover:bg-white">
                      <Link
                        className="flex min-h-9 min-w-0 flex-1 items-start gap-2 px-1.5 py-1.5 text-xs font-medium leading-5 text-[#071b38]"
                        href={`/admin/question-banks/${paper.id}`}
                        title={paper.title}
                      >
                        <FileText size={14} className="mt-0.5 shrink-0" />
                        <span className="min-w-0 break-words">{paper.title}</span>
                      </Link>
                      <form
                        action={deleteQuestionBankPaper}
                        className="shrink-0 opacity-0 transition group-hover/paper:opacity-100"
                        onSubmit={(event) => {
                          if (!window.confirm("确认删除该题库？此操作不可恢复。")) {
                            event.preventDefault();
                          }
                        }}
                      >
                        {ownerInputs(owner)}
                        <input type="hidden" name="id" value={paper.id} />
                        <button className="grid size-8 place-items-center text-red-500 hover:bg-red-50" type="submit" aria-label="删除题库">
                          <Trash2 size={14} />
                        </button>
                      </form>
                    </div>
                  )) : (
                    <p className="px-2 py-3 text-xs text-slate-400">暂无题库名称</p>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
