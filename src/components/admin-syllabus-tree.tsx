"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, MoreVertical, Plus, Trash2 } from "lucide-react";
import { createSyllabusItem, deleteSyllabusItem, updateSyllabusItem } from "@/app/admin/actions";

type OwnerType = "major" | "public_subject";
type ContentStatus = "draft" | "published" | "archived";
type SyllabusRequirement = "know" | "understand" | "master" | "apply" | null;

export type AdminSyllabusTreeItem = {
  id: string;
  parentId: string | null;
  code: string | null;
  title: string;
  description: string | null;
  requirement: SyllabusRequirement;
  sortOrder: number;
  status: ContentStatus;
};

type TreeNode = AdminSyllabusTreeItem & {
  children: TreeNode[];
};

type MenuState = {
  x: number;
  y: number;
  itemId: string;
} | null;

type PanelMode = "detail" | "add-child" | "delete";

type AdminSyllabusTreeProps = {
  ownerType: OwnerType;
  ownerId: string;
  courseId: string;
  items: AdminSyllabusTreeItem[];
};

function statusText(status: ContentStatus) {
  if (status === "published") {
    return "已发布";
  }
  if (status === "archived") {
    return "停用";
  }
  return "草稿";
}

function requirementText(requirement: SyllabusRequirement) {
  if (requirement === "know") {
    return "了解";
  }
  if (requirement === "understand") {
    return "理解";
  }
  if (requirement === "master") {
    return "掌握";
  }
  if (requirement === "apply") {
    return "应用";
  }
  return "未设置";
}

function statusOptions() {
  return (
    <>
      <option value="draft">草稿</option>
      <option value="published">已发布</option>
      <option value="archived">停用</option>
    </>
  );
}

function requirementOptions() {
  return (
    <>
      <option value="">未设置</option>
      <option value="know">了解</option>
      <option value="understand">理解</option>
      <option value="master">掌握</option>
      <option value="apply">应用</option>
    </>
  );
}

function buildTree(items: AdminSyllabusTreeItem[]) {
  const nodes = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  items.forEach((item) => nodes.set(item.id, { ...item, children: [] }));
  nodes.forEach((node) => {
    if (node.parentId && nodes.has(node.parentId)) {
      nodes.get(node.parentId)?.children.push(node);
      return;
    }
    roots.push(node);
  });

  const sortNodes = (list: TreeNode[]) => {
    list.sort((a, b) => {
      const codeCompare = (a.code || "").localeCompare(b.code || "", "zh-Hans-CN", { numeric: true });
      return codeCompare || a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, "zh-Hans-CN");
    });
    list.forEach((node) => sortNodes(node.children));
  };
  sortNodes(roots);
  return { roots, nodes };
}

function HiddenContext({ ownerType, ownerId, courseId }: Pick<AdminSyllabusTreeProps, "ownerType" | "ownerId" | "courseId">) {
  return (
    <>
      <input type="hidden" name="ownerType" value={ownerType} />
      <input type="hidden" name="ownerId" value={ownerId} />
      <input type="hidden" name="courseId" value={courseId} />
    </>
  );
}

export function AdminSyllabusTree({ ownerType, ownerId, courseId, items }: AdminSyllabusTreeProps) {
  const { roots, nodes } = useMemo(() => buildTree(items), [items]);
  const containerRef = useRef<HTMLElement | null>(null);
  const [selectedId, setSelectedId] = useState(items[0]?.id || "");
  const [expandedIds, setExpandedIds] = useState(() => new Set(items.map((item) => item.id)));
  const [menu, setMenu] = useState<MenuState>(null);
  const [panelMode, setPanelMode] = useState<PanelMode>("detail");
  const [treeWidth, setTreeWidth] = useState(420);
  const [isResizing, setIsResizing] = useState(false);

  const selected = selectedId ? nodes.get(selectedId) || null : null;
  const parentNode = selected?.parentId ? nodes.get(selected.parentId) : null;

  useEffect(() => {
    if (items.length > 0 && (!selectedId || !nodes.has(selectedId))) {
      setSelectedId(items[0].id);
    }
    if (items.length === 0) {
      setSelectedId("");
    }
  }, [items, nodes, selectedId]);

  useEffect(() => {
    function closeMenu() {
      setMenu(null);
    }
    window.addEventListener("click", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, []);

  useEffect(() => {
    if (!isResizing) {
      return;
    }
    function resize(event: MouseEvent) {
      const left = containerRef.current?.getBoundingClientRect().left ?? 0;
      const nextWidth = Math.min(760, Math.max(300, event.clientX - left));
      setTreeWidth(nextWidth);
    }
    function stopResize() {
      setIsResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", resize);
    window.addEventListener("mouseup", stopResize);
    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResize);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing]);

  function toggleExpanded(itemId: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }

  function chooseItem(itemId: string, mode: PanelMode = "detail") {
    setSelectedId(itemId);
    setPanelMode(mode);
    setMenu(null);
  }

  function renderNode(node: TreeNode, level = 0) {
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedIds.has(node.id);
    const isSelected = selectedId === node.id;

    return (
      <li key={node.id}>
        <div
          className={`group flex min-h-9 cursor-pointer items-center gap-1 border-l-2 px-2 py-1.5 text-sm transition ${
            isSelected ? "border-[#0872b9] bg-[#e8f4fb] text-[#075b93]" : "border-transparent hover:bg-slate-50"
          }`}
          style={{ paddingLeft: 8 + level * 18 }}
          onClick={() => chooseItem(node.id)}
          onContextMenu={(event) => {
            event.preventDefault();
            setSelectedId(node.id);
            setMenu({ x: event.clientX, y: event.clientY, itemId: node.id });
          }}
        >
          <button
            className="grid size-5 shrink-0 place-items-center text-slate-500"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              toggleExpanded(node.id);
            }}
          >
            {hasChildren ? isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} /> : <span className="size-1.5 rounded-full bg-slate-300" />}
          </button>
          <span className="min-w-12 shrink-0 font-semibold tabular-nums text-slate-500">{node.code || "-"}</span>
          <span className="min-w-0 flex-1 truncate font-semibold">{node.title}</span>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${node.status === "published" ? "bg-emerald-50 text-emerald-700" : node.status === "archived" ? "bg-slate-100 text-slate-500" : "bg-amber-50 text-amber-700"}`}>
            {statusText(node.status)}
          </span>
          <MoreVertical className="opacity-0 transition group-hover:opacity-100" size={15} />
        </div>
        {hasChildren && isExpanded ? <ul className="ml-4 border-l border-slate-200">{node.children.map((child) => renderNode(child, level + 1))}</ul> : null}
      </li>
    );
  }

  return (
    <section ref={containerRef} className="mt-6 flex gap-0">
      <aside className="shrink-0 border border-slate-300 bg-white p-4 shadow-sm" style={{ width: treeWidth }}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black">大纲树</h2>
            <p className="mt-1 text-xs text-slate-500">左键查看详情，右键操作节点。</p>
          </div>
          <details className="relative">
            <summary className="grid size-9 cursor-pointer list-none place-items-center bg-[#0872b9] text-white [&::-webkit-details-marker]:hidden">
              <Plus size={17} />
            </summary>
            <form action={createSyllabusItem} className="absolute right-0 z-20 mt-2 grid w-[300px] gap-2 border border-slate-300 bg-white p-3 shadow-xl">
              <HiddenContext ownerType={ownerType} ownerId={ownerId} courseId={courseId} />
              <input className="input h-9 rounded-none text-xs" name="title" placeholder="根节点名称" required />
              <select className="input h-9 rounded-none text-xs" name="requirement" defaultValue="">
                {requirementOptions()}
              </select>
              <select className="input h-9 rounded-none text-xs" name="status" defaultValue="draft">
                {statusOptions()}
              </select>
              <button className="primary-button h-9 rounded-none text-xs" type="submit">新增根节点</button>
            </form>
          </details>
        </div>

        <div className="mt-4 max-h-[720px] overflow-auto border border-slate-200 bg-slate-50/70 p-2">
          {roots.length > 0 ? <ul className="space-y-1">{roots.map((node) => renderNode(node))}</ul> : <p className="p-6 text-center text-sm text-slate-500">还没有大纲节点。</p>}
        </div>
      </aside>

      <div
        className="group relative mx-2 w-3 shrink-0 cursor-col-resize"
        role="separator"
        aria-orientation="vertical"
        aria-label="调整大纲树宽度"
        onMouseDown={(event) => {
          event.preventDefault();
          setIsResizing(true);
        }}
      >
        <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-slate-300 transition group-hover:bg-[#0872b9]" />
        <div className="absolute left-1/2 top-1/2 h-12 w-1 -translate-x-1/2 -translate-y-1/2 bg-slate-300 transition group-hover:bg-[#0872b9]" />
      </div>

      <div className="min-w-0 flex-1 border border-slate-300 bg-white p-5 shadow-sm">
        {selected ? (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
              <div>
                <p className="text-xs font-semibold uppercase text-slate-400">节点详情</p>
                <h2 className="mt-1 text-xl font-black">{selected.code ? `${selected.code} ` : ""}{selected.title}</h2>
                <p className="mt-1 text-sm text-slate-500">父节点：{parentNode ? `${parentNode.code || "-"} ${parentNode.title}` : "根节点"} · {requirementText(selected.requirement)}</p>
              </div>
              <div className="flex gap-2">
                <button className="secondary-button h-9 rounded-none px-3 text-xs" type="button" onClick={() => setPanelMode("add-child")}>添加子节点</button>
                <button className="danger-button h-9 rounded-none px-3 text-xs" type="button" onClick={() => setPanelMode("delete")}>删除</button>
              </div>
            </div>

            {panelMode === "add-child" ? (
              <form action={createSyllabusItem} className="mt-5 grid gap-3 border border-slate-200 bg-slate-50 p-4 lg:grid-cols-[1fr_150px_130px]">
                <HiddenContext ownerType={ownerType} ownerId={ownerId} courseId={courseId} />
                <input type="hidden" name="parentId" value={selected.id} />
                <div>
                  <label className="label">子节点名称</label>
                  <input className="input rounded-none" name="title" placeholder="例如 计算机发展及分类" required />
                </div>
                <div>
                  <label className="label">考查要求</label>
                  <select className="input rounded-none" name="requirement" defaultValue="">
                    {requirementOptions()}
                  </select>
                </div>
                <div>
                  <label className="label">状态</label>
                  <select className="input rounded-none" name="status" defaultValue="draft">
                    {statusOptions()}
                  </select>
                </div>
                <div className="lg:col-span-3">
                  <label className="label">说明</label>
                  <textarea className="input min-h-24 rounded-none" name="description" placeholder="可以粘贴大纲原文或维护说明。" />
                </div>
                <div className="flex justify-end gap-2 lg:col-span-3">
                  <button className="secondary-button rounded-none" type="button" onClick={() => setPanelMode("detail")}>取消</button>
                  <button className="primary-button rounded-none" type="submit">保存子节点</button>
                </div>
              </form>
            ) : null}

            {panelMode === "delete" ? (
              <div className="mt-5 border border-red-200 bg-red-50 p-4">
                <h3 className="font-bold text-red-700">删除节点</h3>
                <p className="mt-2 text-sm text-red-700">将删除当前节点及其子节点；已关联的知识点和题目会与该大纲节点脱钩。</p>
                <form
                  action={deleteSyllabusItem}
                  className="mt-4 flex justify-end gap-2"
                  onSubmit={(event) => {
                    if (!window.confirm("确认删除该大纲节点？此操作会同时删除它的子节点。")) {
                      event.preventDefault();
                    }
                  }}
                >
                  <HiddenContext ownerType={ownerType} ownerId={ownerId} courseId={courseId} />
                  <input type="hidden" name="id" value={selected.id} />
                  <button className="secondary-button rounded-none" type="button" onClick={() => setPanelMode("detail")}>取消</button>
                  <button className="danger-button rounded-none" type="submit"><Trash2 size={16} />确认删除</button>
                </form>
              </div>
            ) : null}

            {panelMode === "detail" ? (
              <form key={selected.id} action={updateSyllabusItem} className="mt-5 grid gap-4">
                <HiddenContext ownerType={ownerType} ownerId={ownerId} courseId={courseId} />
                <input type="hidden" name="id" value={selected.id} />
                <div className="grid gap-3 md:grid-cols-[140px_1fr]">
                  <div>
                    <label className="label">自动编码</label>
                    <div className="flex min-h-11 items-center border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-600">{selected.code || "-"}</div>
                  </div>
                  <div>
                    <label className="label">节点名称</label>
                    <input className="input rounded-none" name="title" defaultValue={selected.title} required />
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="label">考查要求</label>
                    <select className="input rounded-none" name="requirement" defaultValue={selected.requirement || ""}>
                      {requirementOptions()}
                    </select>
                  </div>
                  <div>
                    <label className="label">状态</label>
                    <select className="input rounded-none" name="status" defaultValue={selected.status}>
                      {statusOptions()}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="label">节点说明</label>
                  <textarea className="input min-h-36 rounded-none" name="description" defaultValue={selected.description || ""} />
                </div>
                <div className="flex justify-end">
                  <button className="primary-button rounded-none" type="submit">保存修改</button>
                </div>
              </form>
            ) : null}
          </>
        ) : (
          <div className="grid min-h-[360px] place-items-center text-sm text-slate-500">请先在左侧创建或选择一个大纲节点。</div>
        )}
      </div>

      {menu ? (
        <div className="fixed z-50 w-44 border border-slate-300 bg-white p-1 text-sm shadow-xl" style={{ left: menu.x, top: menu.y }} onClick={(event) => event.stopPropagation()}>
          <button className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50" type="button" onClick={() => chooseItem(menu.itemId, "detail")}>查看 / 重命名</button>
          <button className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50" type="button" onClick={() => chooseItem(menu.itemId, "add-child")}>添加子节点</button>
          <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-600 hover:bg-red-50" type="button" onClick={() => chooseItem(menu.itemId, "delete")}>删除节点</button>
        </div>
      ) : null}
    </section>
  );
}
