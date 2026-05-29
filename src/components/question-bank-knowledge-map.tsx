"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { HelpCircle, Plus, RefreshCw, RotateCcw, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import {
  createQuestionBankKnowledgeMapOwner,
  deleteQuestionBankKnowledgeMapOwner,
  deleteQuestionBankKnowledgeMapCourse,
  deleteQuestionBankKnowledgeMapItem,
  renameQuestionBankKnowledgeMapOwner,
  renameQuestionBankKnowledgeMapItem
} from "@/app/admin/actions";
import { cn } from "@/lib/utils";
import type { QuestionBankOwnerType } from "@/lib/question-bank-catalog";

export type KnowledgeMapOwner = {
  type: QuestionBankOwnerType;
  id: string;
  name: string;
};

export type KnowledgeMapNode = {
  id: string;
  title: string;
  code?: string | null;
  courseId?: string;
  parentId?: string | null;
  children: KnowledgeMapNode[];
};

type FlatMapNode = KnowledgeMapNode & {
  depth: number;
  mutable: boolean;
  deletable: boolean;
  courseId: string;
  courseTitle: string;
};

type QuestionBankKnowledgeMapProps = {
  owners: KnowledgeMapOwner[];
  selectedOwner: KnowledgeMapOwner;
  selectedOwnerKey: string;
  root: KnowledgeMapNode;
};

const branchColors = [
  { node: "#6f9f91", line: "#7ca99b", soft: "#eff7f4", text: "#17463b" },
  { node: "#e7c86a", line: "#d6b758", soft: "#fff8df", text: "#5b4510" },
  { node: "#6686e8", line: "#8aa1ef", soft: "#eef3ff", text: "#19356f" },
  { node: "#d47a62", line: "#cc735f", soft: "#fff1ed", text: "#6c2718" },
  { node: "#8d7bd3", line: "#a092df", soft: "#f4f1ff", text: "#3f2e78" },
  { node: "#57a7bd", line: "#76b8c8", soft: "#edf9fc", text: "#164b59" }
];

function ownerKey(owner: Pick<KnowledgeMapOwner, "type" | "id">) {
  return `${owner.type}:${owner.id}`;
}

function ownerMapHref(owner: KnowledgeMapOwner) {
  return `/admin/question-banks/knowledge-points?type=${owner.type}&id=${encodeURIComponent(owner.id)}`;
}

function nodeTitle(node: KnowledgeMapNode) {
  return node.code ? `${node.code} ${node.title}` : node.title;
}

function countNodes(node: KnowledgeMapNode): number {
  return 1 + node.children.reduce((sum, child) => sum + countNodes(child), 0);
}

function clampZoom(value: number) {
  return Math.min(1.35, Math.max(0.45, Number(value.toFixed(2))));
}

function isTextInputTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function collectFlatNodes(root: KnowledgeMapNode) {
  const nodes: FlatMapNode[] = [];

  function visit(node: KnowledgeMapNode, depth: number, courseId = "", courseTitle = "") {
    const nextCourseId = depth === 1 ? node.courseId || node.id : courseId;
    const nextCourseTitle = depth === 1 ? node.title : courseTitle;

    if (depth > 0 && nextCourseId) {
      nodes.push({
        ...node,
        depth,
        mutable: depth >= 2,
        deletable: depth >= 1,
        courseId: nextCourseId,
        courseTitle: nextCourseTitle
      });
    }

    node.children.forEach((child) => visit(child, depth + 1, nextCourseId, nextCourseTitle));
  }

  visit(root, 0);
  return nodes;
}

function HiddenOwnerInputs({ owner }: { owner: KnowledgeMapOwner }) {
  return (
    <>
      <input type="hidden" name="ownerType" value={owner.type} />
      <input type="hidden" name="ownerId" value={owner.id} />
    </>
  );
}

function DialogFrame({
  title,
  children,
  onClose
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/25 px-5" data-no-pan>
      <div className="w-full max-w-[430px] border border-[#d3d9e3] bg-white p-5 shadow-2xl">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-base font-black text-[#102033]">{title}</h2>
          <button className="grid size-8 place-items-center text-slate-400 hover:bg-slate-100 hover:text-slate-700" type="button" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function MindNode({
  node,
  depth,
  colorIndex,
  selectedNodeId,
  onSelect,
  onRename,
  onDelete
}: {
  node: KnowledgeMapNode;
  depth: number;
  colorIndex: number;
  selectedNodeId: string;
  onSelect: (nodeId: string) => void;
  onRename: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
}) {
  const palette = branchColors[colorIndex % branchColors.length];
  const childCount = node.children.length;
  const isRoot = depth === 0;
  const isCourse = depth === 1;
  const isMutable = depth >= 2;
  const selected = selectedNodeId === node.id;

  return (
    <div className="flex items-center">
      <div
        className={cn(
          "group/node relative z-10 inline-flex min-h-9 max-w-[360px] items-center rounded-md border px-4 py-2 text-sm font-bold leading-5 shadow-sm",
          "cursor-pointer select-none transition hover:brightness-[0.98]",
          isRoot && "min-h-16 cursor-default rounded-lg px-7 text-3xl text-white",
          isCourse && "min-h-11 text-base text-white",
          !isRoot && !isCourse && "bg-white text-[#102033]",
          selected && !isRoot && "ring-2 ring-[#5d7df7]/40"
        )}
        style={{
          backgroundColor: isRoot ? "#cf654b" : isCourse ? palette.node : "#ffffff",
          borderColor: selected && !isRoot ? "#5d7df7" : isRoot ? "#cf654b" : palette.line,
          color: isRoot || isCourse ? "#ffffff" : "#102033"
        }}
        title={nodeTitle(node)}
        data-no-pan
        onClick={() => {
          if (!isRoot) {
            onSelect(node.id);
          }
        }}
        onDoubleClick={() => {
          if (isMutable) {
            onRename(node.id);
          }
        }}
      >
        <span className="break-words">{node.title}</span>
        {node.code && !isRoot ? <span className="ml-2 shrink-0 text-[11px] font-black opacity-60">{node.code}</span> : null}
        {childCount > 0 && !isRoot ? (
          <span
            className="ml-2 grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-black"
            style={{ backgroundColor: isCourse ? "rgba(255,255,255,.2)" : palette.soft, color: isCourse ? "#fff" : palette.text }}
          >
            {childCount}
          </span>
        ) : null}

        {!isRoot ? (
          <div className="ml-2 shrink-0">
            <button
              className={cn(
                "h-7 rounded px-2 text-xs font-bold opacity-0 shadow-sm transition group-hover/node:opacity-100",
                isCourse ? "bg-white/15 text-white hover:bg-white/25" : "bg-red-50 text-red-500 hover:bg-red-100"
              )}
              type="button"
              aria-label={isCourse ? "删除专业课" : "删除知识点"}
              onClick={(event) => {
                event.stopPropagation();
                onDelete(node.id);
              }}
            >
              删除
            </button>
          </div>
        ) : null}
      </div>

      {childCount > 0 ? (
        <div className="flex items-center">
          <span className="h-px w-10" style={{ backgroundColor: palette.line }} />
          <div className="relative flex flex-col gap-3 py-2">
            <span className="absolute bottom-6 left-0 top-6 w-px" style={{ backgroundColor: palette.line }} />
            {node.children.map((child, index) => (
              <div key={child.id} className="flex items-center">
                <span className="relative z-10 h-px w-6" style={{ backgroundColor: palette.line }} />
                <MindNode
                  node={child}
                  depth={depth + 1}
                  colorIndex={isRoot ? index : colorIndex}
                  selectedNodeId={selectedNodeId}
                  onSelect={onSelect}
                  onRename={onRename}
                  onDelete={onDelete}
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function QuestionBankKnowledgeMap({ owners, selectedOwner, selectedOwnerKey, root }: QuestionBankKnowledgeMapProps) {
  const router = useRouter();
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const panRef = useRef({ active: false, pointerId: 0, startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0 });
  const [zoom, setZoom] = useState(0.72);
  const [isPanning, setIsPanning] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [addOwnerDialog, setAddOwnerDialog] = useState(false);
  const [renameOwner, setRenameOwner] = useState<KnowledgeMapOwner | null>(null);
  const [deleteOwner, setDeleteOwner] = useState<KnowledgeMapOwner | null>(null);
  const [renameNode, setRenameNode] = useState<FlatMapNode | null>(null);
  const [deleteNode, setDeleteNode] = useState<FlatMapNode | null>(null);
  const [syncing, setSyncing] = useState(false);
  const nodeCount = useMemo(() => countNodes(root), [root]);
  const flatNodes = useMemo(() => collectFlatNodes(root), [root]);
  const selectedNode = flatNodes.find((node) => node.id === selectedNodeId) || null;

  function zoomBy(delta: number) {
    setZoom((current) => clampZoom(current + delta));
  }

  function findMapNode(nodeId: string) {
    return flatNodes.find((item) => item.id === nodeId) || null;
  }

  function findMutableNode(nodeId: string) {
    const node = findMapNode(nodeId);
    return node?.mutable ? node : null;
  }

  function syncFromSyllabus() {
    setSyncing(true);
    router.refresh();
    window.setTimeout(() => setSyncing(false), 700);
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isTextInputTarget(event.target)) {
        return;
      }

      if (event.key === "Tab") {
        event.preventDefault();
        setAddOwnerDialog(true);
      }

      if ((event.key === "Delete" || event.key === "Backspace") && selectedNode?.deletable) {
        event.preventDefault();
        setDeleteNode(selectedNode);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedNode]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    function handleWheel(event: WheelEvent) {
      if (!event.ctrlKey) {
        return;
      }

      event.preventDefault();
      setZoom((current) => clampZoom(current + (event.deltaY > 0 ? -0.08 : 0.08)));
    }

    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleWheel);
  }, []);

  function startCanvasPan(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || (event.target instanceof HTMLElement && event.target.closest("[data-no-pan]"))) {
      return;
    }
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    panRef.current = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop
    };
    setIsPanning(true);
  }

  function moveCanvasPan(event: PointerEvent<HTMLDivElement>) {
    const viewport = viewportRef.current;
    const pan = panRef.current;
    if (!viewport || !pan.active || pan.pointerId !== event.pointerId) {
      return;
    }
    viewport.scrollLeft = pan.scrollLeft - (event.clientX - pan.startX);
    viewport.scrollTop = pan.scrollTop - (event.clientY - pan.startY);
  }

  function stopCanvasPan(event: PointerEvent<HTMLDivElement>) {
    if (panRef.current.pointerId === event.pointerId) {
      panRef.current.active = false;
      setIsPanning(false);
    }
  }

  const deleteIsCourse = deleteNode?.depth === 1;
  const deleteTargetName = deleteIsCourse ? "专业课" : "知识点";

  return (
    <section className="grid h-[calc(100vh-51px)] grid-cols-[340px_minmax(0,1fr)] overflow-hidden bg-[#dfe3e9] text-[#102033]">
      <aside className="overflow-y-auto border-r border-[#d3d9e3] bg-[#f6f8fc]">
        <div className="flex h-12 items-center gap-2 px-2 pt-2">
          <button
            className="grid size-8 place-items-center rounded border border-[#dce2eb] bg-white text-[#344054] shadow-sm hover:text-[#0872b9]"
            type="button"
            aria-label="新增知识点"
            title="新增知识点"
            onClick={() => setAddOwnerDialog(true)}
          >
            <Plus size={18} />
          </button>
          <button
            className="inline-flex h-8 items-center gap-1 rounded border border-[#dce2eb] bg-white px-2 text-xs font-bold text-[#344054] shadow-sm hover:text-[#0872b9]"
            type="button"
            onClick={syncFromSyllabus}
          >
            <RefreshCw className={cn(syncing && "animate-spin")} size={15} />
            同步
          </button>
        </div>

        <nav className="mt-1 px-2 text-sm" aria-label="知识点导图目录">
          <div className="mb-5 flex h-10 items-center gap-2 px-3 font-medium text-[#071b38]">
            <span className="grid size-4 place-items-center rounded-sm bg-[#172033] text-[10px] font-black text-white">知</span>
            新的知识点
          </div>
          <div className="space-y-2 pb-6">
            {owners.map((owner) => {
              const active = ownerKey(owner) === selectedOwnerKey;
              return (
                <div
                  key={ownerKey(owner)}
                  className={cn(
                    "group/owner flex min-h-[54px] items-center gap-3 rounded-md px-3 text-sm font-bold transition",
                    active ? "bg-[#5d7df7] text-white shadow-sm" : "text-[#071b38] hover:bg-white"
                  )}
                >
                  <span className={cn("grid size-4 place-items-center rounded-sm text-[10px] font-black", active ? "bg-white/20 text-white" : "bg-[#e4ebff] text-[#5d7df7]")}>知</span>
                  <Link className="min-w-0 flex-1 truncate py-4" href={ownerMapHref(owner)}>
                    {owner.name}
                  </Link>
                  <div className="flex shrink-0 items-center gap-1 opacity-0 transition group-hover/owner:opacity-100">
                    <button
                      className={cn("h-7 rounded px-2 text-xs font-bold", active ? "bg-white/15 text-white hover:bg-white/25" : "bg-slate-50 text-[#344054] hover:bg-slate-100")}
                      type="button"
                      onClick={() => setRenameOwner(owner)}
                    >
                      重命名
                    </button>
                    <button
                      className={cn("h-7 rounded px-2 text-xs font-bold", active ? "bg-white/15 text-white hover:bg-white/25" : "bg-red-50 text-red-500 hover:bg-red-100")}
                      type="button"
                      onClick={() => setDeleteOwner(owner)}
                    >
                      删除
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </nav>
      </aside>

      <div
        ref={viewportRef}
        className={cn("relative min-w-0 overflow-auto", isPanning ? "cursor-grabbing" : "cursor-grab")}
        onPointerDown={startCanvasPan}
        onPointerMove={moveCanvasPan}
        onPointerUp={stopCanvasPan}
        onPointerCancel={stopCanvasPan}
      >
        <div
          className="min-h-full min-w-max px-24 py-20"
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: "120px 120px"
          }}
        >
          <MindNode
            node={root}
            depth={0}
            colorIndex={0}
            selectedNodeId={selectedNodeId}
            onSelect={setSelectedNodeId}
            onRename={(nodeId) => {
              const node = findMutableNode(nodeId);
              if (node) {
                setRenameNode(node);
              }
            }}
            onDelete={(nodeId) => {
              const node = findMapNode(nodeId);
              if (node?.deletable) {
                setDeleteNode(node);
              }
            }}
          />
        </div>

        <div className="absolute left-6 top-5 rounded-md border border-[#d3d9e3] bg-white/90 px-4 py-3 shadow-sm" data-no-pan>
          <h1 className="text-sm font-black">{root.title}</h1>
          <p className="mt-1 text-xs text-slate-500">{root.children.length} 门课程 / {Math.max(0, nodeCount - 1)} 个节点</p>
        </div>

        <div className="fixed right-8 top-[67px] z-40 flex items-center gap-4 bg-white px-5 py-3 text-sm font-bold shadow-sm" data-no-pan>
          <button className="inline-flex h-10 items-center gap-2 px-2 text-[#0f1f35] hover:bg-[#f2f4f7]" type="button" onClick={() => zoomBy(0.08)}>
            <ZoomIn size={17} />
            放大
          </button>
          <button className="inline-flex h-10 items-center gap-2 px-2 text-[#0f1f35] hover:bg-[#f2f4f7]" type="button" onClick={() => zoomBy(-0.08)}>
            <ZoomOut size={17} />
            缩小
          </button>
          <button className="inline-flex h-10 items-center gap-2 px-2 text-[#0f1f35] hover:bg-[#f2f4f7]" type="button" onClick={() => setZoom(0.72)}>
            <RotateCcw size={17} />
            复位
          </button>
          <div className="group/help relative">
            <button className="inline-flex h-10 items-center gap-2 px-2 text-[#4d72ff] hover:bg-[#f2f4f7]" type="button">
              <HelpCircle size={17} />
              帮助
            </button>
            <div className="pointer-events-none absolute right-0 top-12 hidden w-64 rounded-lg bg-white px-5 py-5 text-[#102033] shadow-2xl ring-1 ring-black/5 group-hover/help:block">
              <h3 className="mb-3 text-base font-black">操作提示</h3>
              <ul className="grid gap-3 text-sm font-semibold leading-5">
                <li>• 按住 <kbd className="rounded bg-slate-100 px-2 py-1 text-xs">Ctrl</kbd> 滑动滚轮缩放导图</li>
                <li>• 左上角 <kbd className="rounded bg-slate-100 px-2 py-1 text-xs">+</kbd> 新增知识点</li>
                <li>• 鼠标悬停节点后方可删除</li>
                <li>• 按 <kbd className="rounded bg-slate-100 px-2 py-1 text-xs">Delete</kbd> 键删除节点</li>
                <li>• 拖动画布可调整视图</li>
                <li>• 双击节点可编辑内容</li>
              </ul>
            </div>
          </div>
        </div>

        {root.children.length === 0 ? (
          <div className="absolute inset-0 grid place-items-center text-sm text-slate-500" data-no-pan>
            <div className="rounded-md bg-white px-5 py-4 shadow-sm">当前专业还没有可展示的大纲节点。</div>
          </div>
        ) : null}
      </div>

      {addOwnerDialog ? (
        <DialogFrame title="添加知识点" onClose={() => setAddOwnerDialog(false)}>
          <form action={createQuestionBankKnowledgeMapOwner} className="mt-4 grid gap-3" onSubmit={() => setAddOwnerDialog(false)}>
            <div>
              <label className="label">知识点名称</label>
              <input className="input rounded-none" name="name" autoFocus required />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button className="secondary-button rounded-none" type="button" onClick={() => setAddOwnerDialog(false)}>取消</button>
              <button className="primary-button rounded-none" type="submit">保存</button>
            </div>
          </form>
        </DialogFrame>
      ) : null}

      {renameOwner ? (
        <DialogFrame title="重命名知识点" onClose={() => setRenameOwner(null)}>
          <form action={renameQuestionBankKnowledgeMapOwner} className="mt-4 grid gap-3" onSubmit={() => setRenameOwner(null)}>
            <HiddenOwnerInputs owner={renameOwner} />
            <div>
              <label className="label">知识点名称</label>
              <input className="input rounded-none" name="name" defaultValue={renameOwner.name} autoFocus required />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button className="secondary-button rounded-none" type="button" onClick={() => setRenameOwner(null)}>取消</button>
              <button className="primary-button rounded-none" type="submit">保存</button>
            </div>
          </form>
        </DialogFrame>
      ) : null}

      {deleteOwner ? (
        <DialogFrame title="删除知识点" onClose={() => setDeleteOwner(null)}>
          <form action={deleteQuestionBankKnowledgeMapOwner} className="mt-4 grid gap-4" onSubmit={() => setDeleteOwner(null)}>
            <HiddenOwnerInputs owner={deleteOwner} />
            <p className="text-sm leading-6 text-slate-600">
              确认删除「<span className="font-bold text-[#102033]">{deleteOwner.name}</span>」？它会从左侧知识点列表中移除。
            </p>
            <div className="flex justify-end gap-2">
              <button className="secondary-button rounded-none" type="button" onClick={() => setDeleteOwner(null)}>取消</button>
              <button className="danger-button rounded-none" type="submit">
                <Trash2 size={16} />
                确认删除
              </button>
            </div>
          </form>
        </DialogFrame>
      ) : null}

      {renameNode ? (
        <DialogFrame title="重命名知识点" onClose={() => setRenameNode(null)}>
          <form action={renameQuestionBankKnowledgeMapItem} className="mt-4 grid gap-3" onSubmit={() => setRenameNode(null)}>
            <HiddenOwnerInputs owner={selectedOwner} />
            <input type="hidden" name="id" value={renameNode.id} />
            <input type="hidden" name="courseId" value={renameNode.courseId} />
            <div>
              <label className="label">知识点名称</label>
              <input className="input rounded-none" name="title" defaultValue={renameNode.title} autoFocus required />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button className="secondary-button rounded-none" type="button" onClick={() => setRenameNode(null)}>取消</button>
              <button className="primary-button rounded-none" type="submit">保存</button>
            </div>
          </form>
        </DialogFrame>
      ) : null}

      {deleteNode ? (
        <DialogFrame title={`删除${deleteTargetName}`} onClose={() => setDeleteNode(null)}>
          <form action={deleteIsCourse ? deleteQuestionBankKnowledgeMapCourse : deleteQuestionBankKnowledgeMapItem} className="mt-4 grid gap-4" onSubmit={() => setDeleteNode(null)}>
            <HiddenOwnerInputs owner={selectedOwner} />
            <input type="hidden" name="id" value={deleteNode.id} />
            <input type="hidden" name="courseId" value={deleteNode.courseId} />
            <p className="text-sm leading-6 text-slate-600">
              确认删除{deleteTargetName}「<span className="font-bold text-[#102033]">{deleteNode.title}</span>」？{deleteIsCourse ? "该专业课下的大纲节点和试卷会一起删除，章节关联会解除。" : "它的子节点也会一起删除。"}
            </p>
            <div className="flex justify-end gap-2">
              <button className="secondary-button rounded-none" type="button" onClick={() => setDeleteNode(null)}>取消</button>
              <button className="danger-button rounded-none" type="submit">
                <Trash2 size={16} />
                确认删除
              </button>
            </div>
          </form>
        </DialogFrame>
      ) : null}
    </section>
  );
}
