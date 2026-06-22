"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { ArrowLeft, CheckCircle2, ChevronRight, Lock, Maximize2, Minimize2, Sparkles, ZoomIn, ZoomOut } from "lucide-react";
import type { SyllabusPathGroup, SyllabusPathStatus } from "@/lib/syllabus-learning";
import { cn } from "@/lib/utils";

type MapNodeKind = "root" | "course" | "chapter" | "section";

type MapNode = {
  id: string;
  title: string;
  subtitle?: string;
  kind: MapNodeKind;
  status?: SyllabusPathStatus;
  href?: string;
  children: MapNode[];
};

type CourseKnowledgeMapProps = {
  selectedGroup: SyllabusPathGroup | null;
};

const branchColors = [
  { node: "#14b8a6", line: "#99d8d0", soft: "#ecfdf5", text: "#0f766e" },
  { node: "#0284c7", line: "#a7cfee", soft: "#eff6ff", text: "#075985" },
  { node: "#7c3aed", line: "#c8b5f6", soft: "#f5f3ff", text: "#5b21b6" },
  { node: "#f59e0b", line: "#f4cf84", soft: "#fffbeb", text: "#92400e" },
  { node: "#ef4444", line: "#f3b2b2", soft: "#fff1f2", text: "#b91c1c" },
  { node: "#0f766e", line: "#9ccfca", soft: "#f0fdfa", text: "#115e59" }
];

function clampZoom(value: number) {
  return Math.min(1.25, Math.max(0.55, Number(value.toFixed(2))));
}

function statusLabel(status?: SyllabusPathStatus) {
  if (status === "passed") {
    return "已通过";
  }
  if (status === "unlocked") {
    return "可学习";
  }
  if (status === "locked") {
    return "未解锁";
  }
  return "";
}

function groupSectionCount(group: SyllabusPathGroup) {
  return group.courses.reduce(
    (total, course) => total + course.chapters.reduce((courseTotal, chapter) => courseTotal + chapter.sections.length, 0),
    0
  );
}

function buildMapRoot(group: SyllabusPathGroup): MapNode {
  const sectionCount = groupSectionCount(group);

  return {
    id: `group-${group.key}`,
    title: group.name,
    subtitle: `${group.courses.length} 门课程 / ${sectionCount} 个知识点`,
    kind: "root",
    children: group.courses.map((course) => ({
      id: course.id,
      title: course.title,
      subtitle: `${course.chapters.length} 章`,
      kind: "course",
      children: course.chapters.map((chapter) => ({
        id: chapter.id,
        title: chapter.title,
        subtitle: `${chapter.passedCount}/${chapter.sections.length} 已通过`,
        kind: "chapter",
        children: chapter.sections.map((section) => ({
          id: section.id,
          title: section.title,
          subtitle: `${section.questionCount} 题`,
          kind: "section",
          status: section.status,
          href: section.status === "locked" ? undefined : `/learn/${section.id}`,
          children: []
        }))
      }))
    }))
  };
}

function NodeBox({
  node,
  colorIndex,
  collapsed,
  collapsible,
  onToggle
}: {
  node: MapNode;
  colorIndex: number;
  collapsed: boolean;
  collapsible: boolean;
  onToggle: (nodeId: string) => void;
}) {
  const palette = branchColors[colorIndex % branchColors.length];
  const isRoot = node.kind === "root";
  const isCourse = node.kind === "course";
  const isSection = node.kind === "section";
  const locked = node.status === "locked";
  const label = statusLabel(node.status);
  const isLink = Boolean(node.href && !locked);
  const boxClassName = cn(
    "group/node relative z-10 inline-flex min-h-11 max-w-[340px] items-center gap-3 rounded-lg border px-4 py-2 text-left text-sm font-semibold leading-5 shadow-sm transition",
    isRoot && "min-h-16 min-w-52 px-6 text-base",
    isCourse && "min-h-12 text-white",
    !isRoot && !isCourse && "bg-white text-[#102033]",
    isLink && "hover:-translate-y-0.5 hover:shadow-md",
    collapsible && "cursor-pointer hover:-translate-y-0.5 hover:shadow-md",
    locked && "bg-slate-50 text-slate-400"
  );
  const boxStyle = {
    backgroundColor: isRoot ? "#ffffff" : isCourse ? palette.node : locked ? "#f8fafc" : "#ffffff",
    borderColor: isRoot ? "#ccfbf1" : isCourse ? palette.node : locked ? "#e2e8f0" : palette.line,
    color: isCourse ? "#ffffff" : locked ? "#94a3b8" : "#102033"
  };

  const content = (
    <>
      {isSection ? (
        <span
          aria-label={label}
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-full",
            node.status === "passed" && "bg-emerald-100 text-emerald-600",
            node.status === "unlocked" && "bg-sky-100 text-sky-600",
            node.status === "locked" && "bg-slate-200 text-slate-400"
          )}
        >
          {node.status === "passed" ? <CheckCircle2 size={17} /> : node.status === "unlocked" ? <Sparkles size={16} /> : <Lock size={15} />}
        </span>
      ) : null}
      <span className="min-w-0">
        <span className={cn("block break-words", isRoot && "text-lg font-black text-ink")}>{node.title}</span>
        {node.subtitle ? (
          <span className={cn("mt-0.5 block text-xs font-semibold", isCourse ? "text-white/75" : "text-slate-400")}>{node.subtitle}</span>
        ) : null}
      </span>
      {collapsible ? <ChevronRight className={cn("shrink-0 transition", !collapsed && "rotate-90", isCourse ? "text-white/75" : "text-slate-400")} size={16} /> : null}
      {isLink ? <ChevronRight className="shrink-0 text-slate-400" size={16} /> : null}
    </>
  );

  if (collapsible) {
    function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      onToggle(node.id);
    }

    return (
      <button
        aria-expanded={!collapsed}
        className={boxClassName}
        data-no-pan
        onClick={() => onToggle(node.id)}
        onKeyDown={handleKeyDown}
        style={boxStyle}
        title={collapsed ? "展开" : "收起"}
        type="button"
      >
        {content}
      </button>
    );
  }

  if (isLink && node.href) {
    return (
      <Link className={boxClassName} data-no-pan href={node.href} style={boxStyle} title={node.title}>
        {content}
      </Link>
    );
  }

  return (
    <span className={boxClassName} data-no-pan style={boxStyle} title={node.title}>
      {content}
    </span>
  );
}

function MindNode({
  node,
  depth,
  colorIndex,
  collapsedIds,
  onToggle
}: {
  node: MapNode;
  depth: number;
  colorIndex: number;
  collapsedIds: Set<string>;
  onToggle: (nodeId: string) => void;
}) {
  const palette = branchColors[colorIndex % branchColors.length];
  const childCount = node.children.length;
  const collapsible = (node.kind === "course" || node.kind === "chapter") && childCount > 0;
  const collapsed = collapsible && collapsedIds.has(node.id);
  const visibleChildren = collapsed ? [] : node.children;

  return (
    <div className="flex items-center">
      <NodeBox node={node} colorIndex={colorIndex} collapsed={collapsed} collapsible={collapsible} onToggle={onToggle} />

      {visibleChildren.length > 0 ? (
        <div className="flex items-center">
          <span className="h-px w-10 shrink-0" style={{ backgroundColor: palette.line }} />
          <div className="relative flex flex-col gap-3 py-2">
            <span className="absolute bottom-6 left-0 top-6 w-px" style={{ backgroundColor: palette.line }} />
            {visibleChildren.map((child, index) => (
              <div key={child.id} className="flex items-center">
                <span className="relative z-10 h-px w-6 shrink-0" style={{ backgroundColor: palette.line }} />
                <MindNode node={child} depth={depth + 1} colorIndex={depth === 0 ? index : colorIndex} collapsedIds={collapsedIds} onToggle={onToggle} />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function CourseKnowledgeMap({ selectedGroup }: CourseKnowledgeMapProps) {
  const mapShellRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const panRef = useRef({ active: false, pointerId: 0, startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0 });
  const [zoom, setZoom] = useState(0.78);
  const [isPanning, setIsPanning] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());
  const root = useMemo(() => (selectedGroup ? buildMapRoot(selectedGroup) : null), [selectedGroup]);

  useEffect(() => {
    function updateFullscreenState() {
      setIsFullscreen(document.fullscreenElement === mapShellRef.current);
    }

    document.addEventListener("fullscreenchange", updateFullscreenState);
    return () => document.removeEventListener("fullscreenchange", updateFullscreenState);
  }, []);

  function zoomBy(delta: number) {
    setZoom((current) => clampZoom(current + delta));
  }

  function toggleNode(nodeId: string) {
    setCollapsedIds((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }

  async function toggleFullscreen() {
    const element = mapShellRef.current;
    if (!element) {
      return;
    }

    try {
      if (document.fullscreenElement === element) {
        await document.exitFullscreen();
        return;
      }

      await element.requestFullscreen();
    } catch {
      setIsFullscreen(false);
    }
  }

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

  if (!selectedGroup || !root) {
    return (
      <section className="rounded-2xl border border-dashed border-sky-300 bg-white px-6 py-12 text-center shadow-sm">
        <h1 className="text-xl font-black text-ink">暂无可展示的知识点</h1>
        <p className="mt-2 text-sm font-semibold text-slate-500">请先保存学习方案，或等待课程内容发布。</p>
        <Link className="secondary-button mx-auto mt-5 w-fit" href="/course-center">
          <ArrowLeft size={18} />
          返回课程中心
        </Link>
      </section>
    );
  }

  return (
    <section className="min-w-0">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-teal" href="/course-center">
            <ArrowLeft size={20} />
            返回课程中心
          </Link>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-ink">知识点导图</h1>
        </div>

      </header>

      <div ref={mapShellRef} className={cn("mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-[#dfe5ea] shadow-sm", isFullscreen && "mt-0 h-dvh rounded-none border-0")}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 py-3">
          <div className="flex flex-wrap items-center gap-3 text-xs font-black text-slate-500">
            <span className="inline-flex items-center gap-1"><CheckCircle2 className="text-emerald-500" size={16} />已通过</span>
            <span className="inline-flex items-center gap-1"><Sparkles className="text-sky-500" size={16} />可学习</span>
            <span className="inline-flex items-center gap-1"><Lock className="text-slate-400" size={15} />未解锁</span>
          </div>
          <div className="flex items-center gap-2">
            <button className="icon-button size-9" type="button" aria-label="缩小" onClick={() => zoomBy(-0.08)}>
              <ZoomOut size={18} />
            </button>
            <span className="w-12 text-center text-xs font-black text-slate-500">{Math.round(zoom * 100)}%</span>
            <button className="icon-button size-9" type="button" aria-label="放大" onClick={() => zoomBy(0.08)}>
              <ZoomIn size={18} />
            </button>
            <button className="icon-button size-9" type="button" aria-label={isFullscreen ? "退出全屏" : "全屏查看"} onClick={() => void toggleFullscreen()}>
              {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
          </div>
        </div>

        <div
          ref={viewportRef}
          className={cn(
            "min-w-0 overflow-auto",
            isFullscreen ? "h-[calc(100dvh-57px)] min-h-0" : "h-[calc(100dvh-230px)] min-h-[560px]",
            isPanning ? "cursor-grabbing" : "cursor-grab"
          )}
          onPointerDown={startCanvasPan}
          onPointerMove={moveCanvasPan}
          onPointerUp={stopCanvasPan}
          onPointerCancel={stopCanvasPan}
        >
          <div
            className="min-h-full min-w-max px-20 py-14"
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: "80px 80px"
          }}
        >
            <MindNode node={root} depth={0} colorIndex={0} collapsedIds={collapsedIds} onToggle={toggleNode} />
          </div>
        </div>
      </div>
    </section>
  );
}
