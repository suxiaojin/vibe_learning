"use client";

import { type MutableRefObject, type PointerEvent, type ReactNode, type WheelEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { LocateFixed, Maximize2, Minimize2, Network, Rows3, ZoomIn, ZoomOut } from "lucide-react";
import { cn } from "@/lib/utils";

export type KnowledgeMapNode = {
  id: string;
  parentId: string | null;
  title: string;
  depth: number;
  sortOrder: number;
  progressStatus: "not_started" | "learning" | "review_needed" | "mastered";
  children: KnowledgeMapNode[];
};

type PositionedNode = KnowledgeMapNode & {
  x: number;
  y: number;
  width: number;
  height: number;
  hasHiddenChildren: boolean;
};

type Connector = {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
};

type LayoutResult = {
  nodes: PositionedNode[];
  connectors: Connector[];
  width: number;
  height: number;
};

type KnowledgeMapViewProps = {
  nodes: KnowledgeMapNode[];
  projectId: string;
  selectedNodeId: string;
};

const minZoom = 0.42;
const maxZoom = 1.65;

export function KnowledgeMapView({ nodes, projectId, selectedNodeId }: KnowledgeMapViewProps) {
  const [expanded, setExpanded] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoom, setZoom] = useState(0.78);
  const [pan, setPan] = useState({ x: 60, y: 60 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ pointerId: 0, startX: 0, startY: 0, panX: 0, panY: 0 });
  const dragMovedRef = useRef(false);
  const suppressNodeClickRef = useRef(false);
  const viewportRef = useRef<HTMLDivElement>(null);

  const layout = useMemo(() => layoutKnowledgeMap(nodes, expanded), [nodes, expanded]);

  useEffect(() => {
    resetView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, isFullscreen, layout.width, layout.height]);

  useEffect(() => {
    if (!isFullscreen) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsFullscreen(false);
      }
    }
    window.addEventListener("keydown", handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isFullscreen]);

  function resetView() {
    const viewport = viewportRef.current;
    const width = viewport?.clientWidth || 760;
    const height = viewport?.clientHeight || 620;
    const nextZoom = expanded ? (isFullscreen ? 0.78 : 0.66) : 1;
    setZoom(nextZoom);
    setPan({
      x: Math.max(28, width * 0.15),
      y: Math.max(28, height / 2 - (layout.height * nextZoom) / 2)
    });
  }

  function changeZoom(delta: number) {
    setZoom((current) => clampZoom(current + delta));
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const nextZoom = clampZoom(zoom + (event.deltaY > 0 ? -0.08 : 0.08));
    const viewport = viewportRef.current;
    if (!viewport) {
      setZoom(nextZoom);
      return;
    }
    const rect = viewport.getBoundingClientRect();
    const cursorX = event.clientX - rect.left;
    const cursorY = event.clientY - rect.top;
    const contentX = (cursorX - pan.x) / zoom;
    const contentY = (cursorY - pan.y) / zoom;
    setZoom(nextZoom);
    setPan({
      x: cursorX - contentX * nextZoom,
      y: cursorY - contentY * nextZoom
    });
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || (event.target as HTMLElement).closest("[data-map-control]")) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    dragMovedRef.current = false;
    suppressNodeClickRef.current = false;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      panX: pan.x,
      panY: pan.y
    };
    setIsDragging(true);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!isDragging || dragRef.current.pointerId !== event.pointerId) {
      return;
    }
    const movedX = event.clientX - dragRef.current.startX;
    const movedY = event.clientY - dragRef.current.startY;
    if (Math.abs(movedX) > 4 || Math.abs(movedY) > 4) {
      dragMovedRef.current = true;
      suppressNodeClickRef.current = true;
    }
    setPan({
      x: dragRef.current.panX + movedX,
      y: dragRef.current.panY + movedY
    });
  }

  function stopDragging(event: PointerEvent<HTMLDivElement>) {
    if (dragRef.current.pointerId === event.pointerId) {
      setIsDragging(false);
      if (dragMovedRef.current) {
        window.setTimeout(() => {
          suppressNodeClickRef.current = false;
        }, 0);
      }
    }
  }

  return (
    <aside
      className={cn(
        "min-w-0 overflow-hidden bg-white shadow-[0_12px_32px_rgba(16,24,40,0.05)]",
        isFullscreen
          ? "fixed inset-0 z-[90] min-h-dvh rounded-none"
          : "min-h-[calc(100dvh-112px)] rounded-[16px]"
      )}
    >
      <div className="flex h-14 items-center justify-between border-b border-[#edf0f4] px-5">
        <h2 className="text-[17px] font-black text-[#101828]">知识框架</h2>
        <div className="flex items-center gap-4">
          <div className="flex rounded-[12px] bg-[#f1f3f5] p-1">
            <span className="grid size-8 place-items-center rounded-[9px] bg-white text-[#344054] shadow-sm">
              <Network size={17} />
            </span>
            <span className="grid size-8 place-items-center rounded-[9px] text-[#667085]">
              <Rows3 size={17} />
            </span>
          </div>
          {isFullscreen ? (
            <button
              className="grid size-9 place-items-center rounded-full text-[#344054] transition hover:bg-[#f4f6f8]"
              onClick={() => setIsFullscreen(false)}
              title="退出全屏"
              type="button"
            >
              <Minimize2 size={18} />
            </button>
          ) : null}
        </div>
      </div>

      <div
        ref={viewportRef}
        className={cn(
          "relative overflow-hidden bg-white",
          isFullscreen ? "h-[calc(100dvh-56px)]" : "h-[calc(100dvh-168px)]",
          isDragging ? "cursor-grabbing" : "cursor-grab"
        )}
        onPointerCancel={stopDragging}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDragging}
        onWheel={handleWheel}
      >
        {layout.nodes.length > 0 ? (
          <div
            className="absolute left-0 top-0"
            style={{
              height: layout.height,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "0 0",
              width: layout.width
            }}
          >
            <svg
              className="pointer-events-none absolute left-0 top-0"
              height={layout.height}
              viewBox={`0 0 ${layout.width} ${layout.height}`}
              width={layout.width}
            >
              {layout.connectors.map((connector, index) => (
                <path
                  key={`${connector.fromX}-${connector.toX}-${index}`}
                  d={buildConnectorPath(connector)}
                  fill="none"
                  stroke="#e4e8ee"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.8}
                />
              ))}
            </svg>

            {layout.nodes.map((node) => (
              <MapNodePill
                key={node.id}
                node={node}
                projectId={projectId}
                selected={node.id === selectedNodeId}
                suppressClickRef={suppressNodeClickRef}
              />
            ))}
          </div>
        ) : (
          <div className="flex min-h-[420px] flex-col items-center justify-center px-8 text-center">
            <span className="grid size-14 place-items-center rounded-[18px] bg-[#effaf0] text-[#16a329]">
              <Network size={28} />
            </span>
            <h3 className="mt-4 text-lg font-black text-[#101828]">知识框架生成中</h3>
            <p className="mt-2 max-w-sm text-sm leading-6 text-[#98a2b3]">AI 会把资料整理成最多四层的思维导图，完成后自动出现在这里。</p>
          </div>
        )}

        <div className="absolute bottom-6 left-5 z-20 flex flex-col gap-3" data-map-control>
          <MapControlButton
            label={expanded ? "收起全部节点" : "展开全部节点"}
            onClick={() => setExpanded((current) => !current)}
            title="展开/收起全部节点"
          >
            <Network size={18} />
          </MapControlButton>
          <MapControlButton label="居中" onClick={resetView} title="居中">
            <LocateFixed size={18} />
          </MapControlButton>
          <MapControlButton
            label={isFullscreen ? "退出全屏" : "全屏"}
            onClick={() => setIsFullscreen((current) => !current)}
            title={isFullscreen ? "退出全屏" : "全屏"}
          >
            {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </MapControlButton>
          <MapControlButton label="缩小" onClick={() => changeZoom(-0.12)} title="缩小">
            <ZoomOut size={18} />
          </MapControlButton>
          <MapControlButton label="放大" onClick={() => changeZoom(0.12)} title="放大">
            <ZoomIn size={18} />
          </MapControlButton>
        </div>
      </div>
    </aside>
  );
}

function MapNodePill({
  node,
  projectId,
  selected,
  suppressClickRef
}: {
  node: PositionedNode;
  projectId: string;
  selected: boolean;
  suppressClickRef: MutableRefObject<boolean>;
}) {
  const isMastered = node.progressStatus === "mastered";
  return (
    <Link
      className={cn(
        "absolute flex min-h-7 items-center justify-center gap-1.5 bg-transparent px-1 py-1 text-center text-[13px] font-black leading-5 text-[#101828] transition hover:text-[#0f8d25]",
        node.depth === 0 ? "rounded-full border border-[#dde3ea] bg-white px-5 text-[18px] shadow-[0_8px_20px_rgba(16,24,40,0.035)]" : "",
        selected && node.depth > 0 ? "rounded-full border border-[#16a329]/35 bg-white px-4 text-[#0f8d25] shadow-[0_8px_20px_rgba(16,24,40,0.04)] ring-4 ring-[#16a329]/8" : "",
        node.depth === 1 && !selected ? "text-[#f27420]" : "",
        node.depth >= 2 && !selected ? "border-b border-[#dfe4ea]" : "",
        node.depth >= 3 && !selected ? "text-[#1f2937]" : ""
      )}
      data-map-node
      draggable={false}
      href={`/study-buddy/${projectId}?node=${node.id}`}
      onClick={(event) => {
        if (suppressClickRef.current) {
          event.preventDefault();
        }
      }}
      style={{
        height: node.height,
        left: node.x,
        top: node.y - node.height / 2,
        width: node.width
      }}
    >
      <span className={cn("grid size-3.5 shrink-0 place-items-center rounded-full", getDepthDotClass(node.depth))}>
        {isMastered ? <span className="size-2 rounded-full bg-current" /> : <span className="size-1.5 rounded-full bg-current" />}
      </span>
      <span className="line-clamp-2 min-w-0">{node.title}</span>
      {node.hasHiddenChildren ? (
        <span className="absolute -right-4 top-1/2 grid size-4 -translate-y-1/2 place-items-center rounded-full border border-[#aeb6c2] bg-white text-[12px] font-black text-[#5f6977]">
          +
        </span>
      ) : null}
    </Link>
  );
}

function MapControlButton({ children, label, onClick, title }: { children: ReactNode; label: string; onClick: () => void; title: string }) {
  return (
    <button
      className="group relative grid size-8 place-items-center rounded-[8px] bg-white/90 text-[#101828] shadow-[0_8px_20px_rgba(16,24,40,0.08)] ring-1 ring-[#e8edf3] transition hover:bg-[#101828] hover:text-white"
      onClick={onClick}
      title={title}
      type="button"
    >
      {children}
      <span className="pointer-events-none absolute left-10 top-1/2 hidden -translate-y-1/2 whitespace-nowrap rounded-[7px] bg-[#111827] px-3 py-2 text-xs font-black text-white shadow-lg group-hover:block">
        {label}
      </span>
    </button>
  );
}

function layoutKnowledgeMap(nodes: KnowledgeMapNode[], expanded: boolean): LayoutResult {
  const visibleRoots = nodes;
  const nodesOut: PositionedNode[] = [];
  const connectors: Connector[] = [];
  const leftPadding = 72;
  const topPadding = 54;
  const levelGap = expanded ? 224 : 260;
  const siblingGap = expanded ? 20 : 28;

  function nodeWidth(depth: number, title: string) {
    if (depth === 0) {
      return Math.min(360, Math.max(280, title.length * 16 + 72));
    }
    if (depth === 1) {
      return Math.min(232, Math.max(170, title.length * 12 + 32));
    }
    if (depth === 2) {
      return Math.min(208, Math.max(150, title.length * 11 + 26));
    }
    return Math.min(178, Math.max(128, title.length * 10 + 22));
  }

  function visibleChildren(node: KnowledgeMapNode) {
    if (!expanded && node.depth >= 1) {
      return [];
    }
    return node.children;
  }

  function measure(node: KnowledgeMapNode): number {
    const children = visibleChildren(node);
    if (children.length === 0) {
      return 48;
    }
    return Math.max(48, children.reduce((sum, child) => sum + measure(child), 0) + siblingGap * (children.length - 1));
  }

  function layoutNode(node: KnowledgeMapNode, top: number): number {
    const children = visibleChildren(node);
    const subtreeHeight = measure(node);
    const width = nodeWidth(node.depth, node.title);
    const height = node.depth === 0 ? 38 : selectedHeight(node.depth);
    const x = leftPadding + node.depth * levelGap;
    const y = top + subtreeHeight / 2;
    const positioned: PositionedNode = {
      ...node,
      hasHiddenChildren: !expanded && node.children.length > 0 && children.length === 0,
      height,
      width,
      x,
      y
    };
    nodesOut.push(positioned);

    let childTop = top;
    for (const child of children) {
      const childSubtreeHeight = measure(child);
      const childY = layoutNode(child, childTop);
      connectors.push({
        fromX: x + width,
        fromY: y,
        toX: leftPadding + child.depth * levelGap,
        toY: childY
      });
      childTop += childSubtreeHeight + siblingGap;
    }
    return y;
  }

  let cursorTop = topPadding;
  for (const root of visibleRoots) {
    const rootHeight = measure(root);
    layoutNode(root, cursorTop);
    cursorTop += rootHeight + siblingGap;
  }

  const maxX = nodesOut.reduce((value, node) => Math.max(value, node.x + node.width), 0);
  const maxY = nodesOut.reduce((value, node) => Math.max(value, node.y + node.height), 0);
  return {
    connectors,
    height: Math.max(520, maxY + topPadding),
    nodes: nodesOut,
    width: Math.max(820, maxX + 140)
  };
}

function buildConnectorPath(connector: Connector) {
  const distance = Math.max(80, connector.toX - connector.fromX);
  const curve = Math.min(132, Math.max(72, distance * 0.52));
  const c1x = connector.fromX + curve;
  const c2x = connector.toX - curve * 0.88;
  return `M ${connector.fromX} ${connector.fromY} C ${c1x} ${connector.fromY}, ${c2x} ${connector.toY}, ${connector.toX} ${connector.toY}`;
}

function selectedHeight(depth: number) {
  return depth <= 1 ? 30 : 28;
}

function clampZoom(value: number) {
  return Math.max(minZoom, Math.min(maxZoom, Number(value.toFixed(2))));
}

function getDepthDotClass(depth: number) {
  if (depth === 0) {
    return "text-[#101828]";
  }
  if (depth === 1) {
    return "text-[#f27420]";
  }
  if (depth === 2) {
    return "text-[#16a329]";
  }
  return "text-[#667085]";
}
