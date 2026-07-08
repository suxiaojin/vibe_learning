"use client";

import { type MutableRefObject, type PointerEvent, type ReactNode, type WheelEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LocateFixed, Map as MapModeIcon, Maximize2, Menu, Minimize2, Network, PanelLeftClose, ZoomIn, ZoomOut } from "lucide-react";
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
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
};

type KnowledgeMapViewProps = {
  nodeHrefBase?: string;
  nodes: KnowledgeMapNode[];
  onCollapseSidebar?: () => void;
  projectId: string;
  readOnly?: boolean;
  selectedNodeId: string;
};

type MapViewMode = "mindmap" | "outline";

type EditingNode = {
  nodeId: string;
  title: string;
};

const minZoom = 0.42;
const maxZoom = 1.65;
const defaultMapZoom = 0.7;
const defaultMapViewMode: MapViewMode = "mindmap";
const mapPreferenceKey = "vibe-ai-study-map-preferences:v1";
const lastNodeStoragePrefix = "vibe-ai-study-last-node:v1:";

export function KnowledgeMapView({
  nodeHrefBase,
  nodes,
  onCollapseSidebar,
  projectId,
  readOnly = false,
  selectedNodeId
}: KnowledgeMapViewProps) {
  const router = useRouter();
  const [mapNodes, setMapNodes] = useState(nodes);
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(() => new Set());
  const [editingNode, setEditingNode] = useState<EditingNode | null>(null);
  const [editingError, setEditingError] = useState("");
  const [savingNodeId, setSavingNodeId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewMode, setViewMode] = useState<MapViewMode>(defaultMapViewMode);
  const [zoom, setZoom] = useState(defaultMapZoom);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const dragRef = useRef({ pointerId: 0, startX: 0, startY: 0, panX: 0, panY: 0 });
  const dragMovedRef = useRef(false);
  const suppressNodeClickRef = useRef(false);
  const nodeClickTimerRef = useRef<number | null>(null);
  const skipNextBlurCommitRef = useRef(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const effectiveNodeHrefBase = nodeHrefBase || `/study-buddy/${projectId}`;
  const rememberSelection = !readOnly;

  const layout = useMemo(() => layoutKnowledgeMap(mapNodes, collapsedNodeIds), [mapNodes, collapsedNodeIds]);
  const layoutRef = useRef(layout);
  const zoomRef = useRef(defaultMapZoom);

  useEffect(() => {
    setMapNodes(nodes);
  }, [nodes]);

  useEffect(() => {
    return () => clearNodeClickTimer(nodeClickTimerRef);
  }, []);

  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    let nextZoom = defaultMapZoom;
    let nextViewMode = defaultMapViewMode;
    try {
      const saved = window.localStorage.getItem(mapPreferenceKey);
      if (saved) {
        const parsed = JSON.parse(saved) as { viewMode?: unknown; zoom?: unknown };
        nextZoom = typeof parsed.zoom === "number" ? clampZoom(parsed.zoom) : defaultMapZoom;
        nextViewMode = isMapViewMode(parsed.viewMode) ? parsed.viewMode : defaultMapViewMode;
      }
    } catch {
      // Ignore unavailable or malformed localStorage preferences.
    }
    zoomRef.current = nextZoom;
    setViewMode(nextViewMode);
    setZoom(nextZoom);
    window.requestAnimationFrame(() => centerView(nextZoom));
    setPreferencesReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!preferencesReady) {
      return;
    }
    try {
      window.localStorage.setItem(mapPreferenceKey, JSON.stringify({ viewMode, zoom }));
    } catch {
      // Preference persistence is best-effort only.
    }
  }, [preferencesReady, viewMode, zoom]);

  useEffect(() => {
    if (viewMode !== "mindmap") {
      return;
    }
    const frame = window.requestAnimationFrame(() => centerView(zoomRef.current));
    return () => window.cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFullscreen, layout.width, layout.height, viewMode]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewMode !== "mindmap" || !viewport || !window.ResizeObserver) {
      return;
    }
    let frame = 0;
    const observer = new ResizeObserver(() => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => centerView(zoomRef.current));
    });
    observer.observe(viewport);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]);

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(document.fullscreenElement === viewportRef.current);
      window.requestAnimationFrame(() => centerView(zoomRef.current));
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isFullscreen) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !document.fullscreenElement) {
        setIsFullscreen(false);
      }
    }
    window.addEventListener("keydown", handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isFullscreen]);

  function centerView(targetZoom = zoomRef.current) {
    setPan(getCenteredPan(targetZoom));
  }

  function getCenteredPan(targetZoom = zoomRef.current, targetLayout = layoutRef.current) {
    const viewport = viewportRef.current;
    if (!viewport || targetLayout.nodes.length === 0) {
      return { x: 0, y: 0 };
    }
    const contentWidth = (targetLayout.bounds.maxX - targetLayout.bounds.minX) * targetZoom;
    const contentHeight = (targetLayout.bounds.maxY - targetLayout.bounds.minY) * targetZoom;
    return {
      x: Math.round((viewport.clientWidth - contentWidth) / 2 - targetLayout.bounds.minX * targetZoom),
      y: Math.round((viewport.clientHeight - contentHeight) / 2 - targetLayout.bounds.minY * targetZoom)
    };
  }

  function updateZoom(value: number) {
    const nextZoom = clampZoom(value);
    zoomRef.current = nextZoom;
    setZoom(nextZoom);
    return nextZoom;
  }

  function zoomAroundPoint(value: number, anchorX: number, anchorY: number) {
    const currentZoom = zoomRef.current;
    const nextZoom = clampZoom(value);
    const contentX = (anchorX - pan.x) / currentZoom;
    const contentY = (anchorY - pan.y) / currentZoom;
    updateZoom(nextZoom);
    setPan({
      x: anchorX - contentX * nextZoom,
      y: anchorY - contentY * nextZoom
    });
  }

  function changeZoom(delta: number) {
    const viewport = viewportRef.current;
    if (!viewport) {
      updateZoom(zoomRef.current + delta);
      return;
    }
    zoomAroundPoint(zoomRef.current + delta, viewport.clientWidth / 2, viewport.clientHeight / 2);
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const currentZoom = zoomRef.current;
    const nextZoom = clampZoom(currentZoom + (event.deltaY > 0 ? -0.08 : 0.08));
    const viewport = viewportRef.current;
    if (!viewport) {
      updateZoom(nextZoom);
      return;
    }
    const rect = viewport.getBoundingClientRect();
    const cursorX = event.clientX - rect.left;
    const cursorY = event.clientY - rect.top;
    const contentX = (cursorX - pan.x) / currentZoom;
    const contentY = (cursorY - pan.y) / currentZoom;
    updateZoom(nextZoom);
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

  function scheduleNodeNavigation(nodeId: string) {
    clearNodeClickTimer(nodeClickTimerRef);
    nodeClickTimerRef.current = window.setTimeout(() => {
      if (rememberSelection) {
        rememberSelectedNode(`${lastNodeStoragePrefix}${projectId}`, nodeId);
      }
      router.push(buildNodeHref(effectiveNodeHrefBase, nodeId));
    }, 300);
  }

  function startEditingNode(node: KnowledgeMapNode) {
    if (readOnly) {
      return;
    }
    clearNodeClickTimer(nodeClickTimerRef);
    setEditingError("");
    setEditingNode({ nodeId: node.id, title: node.title });
  }

  async function commitEditingNode() {
    if (skipNextBlurCommitRef.current) {
      skipNextBlurCommitRef.current = false;
      return;
    }
    if (!editingNode || savingNodeId) {
      return;
    }
    const nextTitle = editingNode.title.trim();
    const originalTitle = findNodeTitle(mapNodes, editingNode.nodeId);
    if (!nextTitle || nextTitle === originalTitle) {
      setEditingNode(null);
      setEditingError("");
      return;
    }

    setSavingNodeId(editingNode.nodeId);
    setEditingError("");
    try {
      const response = await fetch(`/api/ai-study/nodes/${editingNode.nodeId}`, {
        body: JSON.stringify({ title: nextTitle }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH"
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(String(payload?.error?.message || payload?.message || "rename_failed"));
      }
      const savedTitle = String(payload?.data?.node?.title || nextTitle);
      setMapNodes((current) => updateNodeTitle(current, editingNode.nodeId, savedTitle));
      setEditingNode(null);
      router.refresh();
    } catch {
      setEditingError("重命名失败，请稍后重试。");
    } finally {
      setSavingNodeId(null);
    }
  }

  function cancelEditingNode() {
    skipNextBlurCommitRef.current = true;
    setEditingNode(null);
    setEditingError("");
  }

  function updateEditingTitle(title: string) {
    setEditingNode((current) => (current ? { ...current, title } : current));
  }

  function toggleNodeCollapse(nodeId: string) {
    setCollapsedNodeIds((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }

  function toggleAllNodes() {
    if (collapsedNodeIds.size === 0) {
      setCollapsedNodeIds(new Set(getCollapsibleNodeIds(mapNodes)));
    } else {
      setCollapsedNodeIds(new Set());
    }
  }

  function handleCollapseSidebar() {
    void exitFullscreenMode();
    onCollapseSidebar?.();
  }

  async function exitFullscreenMode() {
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => undefined);
      return;
    }
    setIsFullscreen(false);
  }

  async function toggleFullscreen() {
    const viewport = viewportRef.current;
    if (document.fullscreenElement) {
      await exitFullscreenMode();
      return;
    }
    if (!viewport) {
      return;
    }
    try {
      if (document.fullscreenEnabled && viewport.requestFullscreen) {
        await viewport.requestFullscreen();
      } else {
        setIsFullscreen(true);
      }
    } catch {
      setIsFullscreen(true);
    } finally {
      window.requestAnimationFrame(() => centerView(zoomRef.current));
    }
  }

  return (
    <aside
      className={cn(
        "relative min-w-0 overflow-hidden bg-white",
        isFullscreen
          ? "fixed inset-0 z-[90] min-h-dvh rounded-none shadow-none"
          : "min-h-[calc(100dvh-112px)] rounded-[16px] shadow-[0_12px_32px_rgba(16,24,40,0.05)]"
      )}
    >
      <div className={cn("h-14 items-center justify-between border-b border-[#edf0f4] px-5", isFullscreen ? "hidden" : "flex")}>
        <h2 className="text-[17px] font-black text-[#101828]">知识框架</h2>
        <div className="flex items-center gap-3" data-map-control>
          <div className="flex rounded-[12px] bg-[#f1f3f5] p-1">
            <HeaderIconButton
              active={viewMode === "mindmap"}
              label="思维导图"
              onClick={() => setViewMode("mindmap")}
            >
              <MapModeIcon size={17} />
            </HeaderIconButton>
            <HeaderIconButton
              active={viewMode === "outline"}
              label="文字大纲"
              onClick={() => setViewMode("outline")}
            >
              <Menu size={18} />
            </HeaderIconButton>
          </div>
          <span className="h-6 w-px bg-[#e4e8ee]" />
          <HeaderIconButton label="收起侧栏" onClick={handleCollapseSidebar}>
            <PanelLeftClose size={18} />
          </HeaderIconButton>
        </div>
      </div>

      {viewMode === "mindmap" ? (
        <div
          ref={viewportRef}
          className={cn(
            "relative overflow-hidden bg-white",
            isFullscreen ? "h-screen" : "h-[calc(100dvh-168px)]",
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
                  collapsed={collapsedNodeIds.has(node.id)}
                  editingNode={editingNode}
                  key={node.id}
                  node={node}
                  onCancelEditing={cancelEditingNode}
                  onCommitEditing={commitEditingNode}
                  onNavigate={scheduleNodeNavigation}
                  onStartEditing={startEditingNode}
                  onToggleCollapse={toggleNodeCollapse}
                  onUpdateEditingTitle={updateEditingTitle}
                  readOnly={readOnly}
                  saving={savingNodeId === node.id}
                  selected={node.id === selectedNodeId}
                  showCollapseControls={collapsedNodeIds.size > 0}
                  suppressClickRef={suppressNodeClickRef}
                />
              ))}
            </div>
          ) : (
            <MapEmptyState />
          )}

          <div className="absolute bottom-6 left-5 z-20 flex flex-col gap-3" data-map-control>
            <MapControlButton
              label={collapsedNodeIds.size === 0 ? "收起全部节点" : "展开全部节点"}
              onClick={toggleAllNodes}
              title="展开/收起全部节点"
            >
              <Network size={18} />
            </MapControlButton>
            <MapControlButton label="居中" onClick={() => centerView()} title="居中">
              <LocateFixed size={18} />
            </MapControlButton>
            <MapControlButton
              label={isFullscreen ? "退出全屏" : "全屏"}
              onClick={() => {
                void toggleFullscreen();
              }}
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
      ) : (
        <MapOutlineView
          collapsedNodeIds={collapsedNodeIds}
          editingNode={editingNode}
          nodes={mapNodes}
          onCancelEditing={cancelEditingNode}
          onCommitEditing={commitEditingNode}
          onNavigate={scheduleNodeNavigation}
          onStartEditing={startEditingNode}
          onToggleCollapse={toggleNodeCollapse}
          onUpdateEditingTitle={updateEditingTitle}
          readOnly={readOnly}
          savingNodeId={savingNodeId}
          selectedNodeId={selectedNodeId}
          viewportClassName={isFullscreen ? "h-screen" : "h-[calc(100dvh-168px)]"}
        />
      )}
      {editingError ? (
        <div className="pointer-events-none absolute bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-full bg-red-50 px-4 py-2 text-xs font-black text-red-600 shadow-sm ring-1 ring-red-100">
          {editingError}
        </div>
      ) : null}
    </aside>
  );
}

function MapNodePill({
  collapsed,
  editingNode,
  node,
  onCancelEditing,
  onCommitEditing,
  onNavigate,
  onStartEditing,
  onToggleCollapse,
  onUpdateEditingTitle,
  readOnly,
  saving,
  selected,
  showCollapseControls,
  suppressClickRef
}: {
  collapsed: boolean;
  editingNode: EditingNode | null;
  node: PositionedNode;
  onCancelEditing: () => void;
  onCommitEditing: () => void;
  onNavigate: (nodeId: string) => void;
  onStartEditing: (node: KnowledgeMapNode) => void;
  onToggleCollapse: (nodeId: string) => void;
  onUpdateEditingTitle: (title: string) => void;
  readOnly: boolean;
  saving: boolean;
  selected: boolean;
  showCollapseControls: boolean;
  suppressClickRef: MutableRefObject<boolean>;
}) {
  const editable = editingNode?.nodeId === node.id;
  const canCollapse = node.depth > 0 && node.children.length > 0;
  return (
    <div
      className={cn(
        "absolute flex min-h-8 items-center justify-center bg-transparent px-1 py-1 text-center text-[14px] font-black leading-[22px] text-[#101828]",
        node.depth === 0 ? "rounded-full border border-[#dde3ea] bg-white px-5 text-[19px] shadow-[0_8px_20px_rgba(16,24,40,0.035)]" : "",
        selected && node.depth > 0 ? "rounded-full border border-[#16a329]/35 bg-white px-4 text-[#0f8d25] shadow-[0_8px_20px_rgba(16,24,40,0.04)] ring-4 ring-[#16a329]/8" : "",
        node.depth === 1 && !selected ? "text-[#f27420]" : "",
        node.depth >= 2 && !selected ? "border-b border-[#dfe4ea]" : "",
        node.depth >= 3 && !selected ? "text-[#1f2937]" : ""
      )}
      data-map-node
      draggable={false}
      style={{
        height: node.height,
        left: node.x,
        top: node.y - node.height / 2,
        width: node.width
      }}
    >
      {editable ? (
        <input
          autoFocus
          className="min-w-0 flex-1 rounded-[8px] border border-[#16a329]/35 bg-white px-2 py-1 text-center text-[14px] font-black leading-5 text-[#101828] outline-none ring-4 ring-[#16a329]/10"
          data-map-control
          disabled={saving}
          onBlur={onCommitEditing}
          onChange={(event) => onUpdateEditingTitle(event.target.value)}
          onClick={(event) => event.stopPropagation()}
          onFocus={(event) => event.currentTarget.select()}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onCommitEditing();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              onCancelEditing();
            }
          }}
          onPointerDown={(event) => event.stopPropagation()}
          value={editingNode?.title || ""}
        />
      ) : (
        <button
          className="line-clamp-2 min-w-0 cursor-pointer text-inherit transition hover:text-[#0f8d25] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#16a329]"
          data-map-control
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (suppressClickRef.current || event.detail > 1) {
              return;
            }
            onNavigate(node.id);
          }}
          onDoubleClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (readOnly) {
              return;
            }
            onStartEditing(node);
          }}
          onPointerDown={(event) => event.stopPropagation()}
          title={readOnly ? node.title : "双击修改名称"}
          type="button"
        >
          {node.title}
        </button>
      )}
      {canCollapse && showCollapseControls ? (
        <button
          aria-label={collapsed ? "展开子节点" : "回收子节点"}
          className="absolute -right-5 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-full border border-[#aeb6c2] bg-white text-[13px] font-black leading-none text-[#5f6977] shadow-[0_4px_10px_rgba(16,24,40,0.05)] transition hover:border-[#667085] hover:text-[#101828]"
          data-map-control
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onToggleCollapse(node.id);
          }}
          onPointerDown={(event) => event.stopPropagation()}
          title={collapsed ? "展开子节点" : "回收子节点"}
          type="button"
        >
          {collapsed ? "+" : "-"}
        </button>
      ) : null}
    </div>
  );
}

function HeaderIconButton({
  active = false,
  children,
  label,
  onClick
}: {
  active?: boolean;
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className={cn(
        "group relative grid size-8 place-items-center rounded-[9px] text-[#667085] transition hover:bg-white hover:text-[#101828] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#16a329]",
        active ? "bg-white text-[#344054] shadow-sm" : ""
      )}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
      <span className="pointer-events-none absolute left-1/2 top-10 z-30 hidden -translate-x-1/2 whitespace-nowrap rounded-[7px] bg-[#111827] px-3 py-2 text-xs font-black text-white shadow-lg group-hover:block">
        {label}
      </span>
    </button>
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

function MapOutlineView({
  collapsedNodeIds,
  editingNode,
  nodes,
  onCancelEditing,
  onCommitEditing,
  onNavigate,
  onStartEditing,
  onToggleCollapse,
  onUpdateEditingTitle,
  readOnly,
  savingNodeId,
  selectedNodeId,
  viewportClassName
}: {
  collapsedNodeIds: Set<string>;
  editingNode: EditingNode | null;
  nodes: KnowledgeMapNode[];
  onCancelEditing: () => void;
  onCommitEditing: () => void;
  onNavigate: (nodeId: string) => void;
  onStartEditing: (node: KnowledgeMapNode) => void;
  onToggleCollapse: (nodeId: string) => void;
  onUpdateEditingTitle: (title: string) => void;
  readOnly: boolean;
  savingNodeId: string | null;
  selectedNodeId: string;
  viewportClassName: string;
}) {
  if (nodes.length === 0) {
    return (
      <div className={cn("overflow-hidden bg-white", viewportClassName)}>
        <MapEmptyState />
      </div>
    );
  }
  return (
    <div className={cn("overflow-y-auto bg-white px-4 py-4", viewportClassName)}>
      <div className="space-y-1.5">
        {nodes.map((node) => (
          <OutlineNode
            collapsedNodeIds={collapsedNodeIds}
            editingNode={editingNode}
            key={node.id}
            node={node}
            onCancelEditing={onCancelEditing}
            onCommitEditing={onCommitEditing}
            onNavigate={onNavigate}
            onStartEditing={onStartEditing}
            onToggleCollapse={onToggleCollapse}
            onUpdateEditingTitle={onUpdateEditingTitle}
            readOnly={readOnly}
            savingNodeId={savingNodeId}
            selectedNodeId={selectedNodeId}
          />
        ))}
      </div>
    </div>
  );
}

function OutlineNode({
  collapsedNodeIds,
  depth = 0,
  editingNode,
  node,
  onCancelEditing,
  onCommitEditing,
  onNavigate,
  onStartEditing,
  onToggleCollapse,
  onUpdateEditingTitle,
  readOnly,
  savingNodeId,
  selectedNodeId
}: {
  collapsedNodeIds: Set<string>;
  depth?: number;
  editingNode: EditingNode | null;
  node: KnowledgeMapNode;
  onCancelEditing: () => void;
  onCommitEditing: () => void;
  onNavigate: (nodeId: string) => void;
  onStartEditing: (node: KnowledgeMapNode) => void;
  onToggleCollapse: (nodeId: string) => void;
  onUpdateEditingTitle: (title: string) => void;
  readOnly: boolean;
  savingNodeId: string | null;
  selectedNodeId: string;
}) {
  const selected = node.id === selectedNodeId;
  const collapsed = collapsedNodeIds.has(node.id);
  const editable = editingNode?.nodeId === node.id;
  const canCollapse = node.depth > 0 && node.children.length > 0;
  return (
    <div>
      <div
        className="group/outline relative flex min-h-9 items-center py-1 pr-3"
        style={{ paddingLeft: 12 + depth * 20 }}
      >
        {canCollapse ? (
          <button
            aria-label={collapsed ? "展开章节" : "收起章节"}
            className="absolute top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-[6px] text-[#2563ff] opacity-0 transition hover:bg-[#eef4ff] group-hover/outline:opacity-100 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563ff]"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onToggleCollapse(node.id);
            }}
            style={{ left: Math.max(4, 12 + depth * 20 - 21) }}
            title={collapsed ? "展开章节" : "收起章节"}
            type="button"
          >
            <span
              className={cn(
                "h-0 w-0 border-y-[5px] border-l-[7px] border-y-transparent border-l-current transition-transform",
                collapsed ? "" : "rotate-90"
              )}
            />
          </button>
        ) : null}
        {editable ? (
          <input
            autoFocus
            className="min-w-0 flex-1 rounded-[8px] border border-[#16a329]/35 bg-white px-2 py-1 text-sm font-black leading-5 text-[#101828] outline-none ring-4 ring-[#16a329]/10"
            disabled={savingNodeId === node.id}
            onBlur={onCommitEditing}
            onChange={(event) => onUpdateEditingTitle(event.target.value)}
            onClick={(event) => event.stopPropagation()}
            onFocus={(event) => event.currentTarget.select()}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onCommitEditing();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                onCancelEditing();
              }
            }}
            value={editingNode?.title || ""}
          />
        ) : (
          <button
            className={cn(
              "min-w-0 flex-1 truncate text-left text-sm font-semibold leading-6 transition hover:text-[#2563ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563ff]",
              selected ? "text-[#2563ff]" : node.depth === 0 ? "text-[17px] text-[#101828]" : "text-[#475467]"
            )}
            onClick={(event) => {
              event.preventDefault();
              if (event.detail > 1) {
                return;
              }
              onNavigate(node.id);
            }}
            onDoubleClick={(event) => {
              event.preventDefault();
              if (readOnly) {
                return;
              }
              onStartEditing(node);
            }}
            title={readOnly ? node.title : "双击修改名称"}
            type="button"
          >
            {node.title}
          </button>
        )}
      </div>
      {node.children.length > 0 && !collapsed ? (
        <div className="mt-1 space-y-1">
          {node.children.map((child) => (
            <OutlineNode
              collapsedNodeIds={collapsedNodeIds}
              key={child.id}
              depth={depth + 1}
              editingNode={editingNode}
              node={child}
              onCancelEditing={onCancelEditing}
              onCommitEditing={onCommitEditing}
              onNavigate={onNavigate}
              onStartEditing={onStartEditing}
              onToggleCollapse={onToggleCollapse}
              onUpdateEditingTitle={onUpdateEditingTitle}
              readOnly={readOnly}
              savingNodeId={savingNodeId}
              selectedNodeId={selectedNodeId}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MapEmptyState() {
  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center px-8 text-center">
      <span className="grid size-14 place-items-center rounded-[18px] bg-[#effaf0] text-[#16a329]">
        <Network size={28} />
      </span>
      <h3 className="mt-4 text-lg font-black text-[#101828]">知识框架生成中</h3>
      <p className="mt-2 max-w-sm text-sm leading-6 text-[#98a2b3]">AI 会把资料整理成最多四层的思维导图，完成后自动出现在这里。</p>
    </div>
  );
}

function layoutKnowledgeMap(nodes: KnowledgeMapNode[], collapsedNodeIds: Set<string>): LayoutResult {
  const visibleRoots = nodes;
  const nodesOut: PositionedNode[] = [];
  const connectors: Connector[] = [];
  const leftPadding = 66;
  const topPadding = 48;
  const columnGap = 72;
  const siblingGap = 14;

  function nodeWidth(depth: number, title: string) {
    if (depth === 0) {
      return Math.min(380, Math.max(300, title.length * 17 + 76));
    }
    if (depth === 1) {
      return Math.min(250, Math.max(184, title.length * 13 + 36));
    }
    if (depth === 2) {
      return Math.min(226, Math.max(164, title.length * 12 + 30));
    }
    return Math.min(196, Math.max(140, title.length * 11 + 24));
  }

  function visibleChildren(node: KnowledgeMapNode) {
    if (collapsedNodeIds.has(node.id)) {
      return [];
    }
    return node.children;
  }

  const columnWidths: number[] = [];
  function collectColumnWidths(node: KnowledgeMapNode) {
    columnWidths[node.depth] = Math.max(columnWidths[node.depth] || 0, nodeWidth(node.depth, node.title));
    for (const child of visibleChildren(node)) {
      collectColumnWidths(child);
    }
  }

  for (const root of visibleRoots) {
    collectColumnWidths(root);
  }

  const columnX: number[] = [];
  for (let depth = 0; depth < columnWidths.length; depth += 1) {
    if (depth === 0) {
      columnX[depth] = leftPadding;
    } else {
      columnX[depth] = (columnX[depth - 1] ?? leftPadding) + (columnWidths[depth - 1] || 0) + columnGap;
    }
  }

  function measure(node: KnowledgeMapNode): number {
    const children = visibleChildren(node);
    if (children.length === 0) {
      return 46;
    }
    return Math.max(46, children.reduce((sum, child) => sum + measure(child), 0) + siblingGap * (children.length - 1));
  }

  function layoutNode(node: KnowledgeMapNode, top: number): number {
    const children = visibleChildren(node);
    const subtreeHeight = measure(node);
    const width = nodeWidth(node.depth, node.title);
    const height = node.depth === 0 ? 42 : selectedHeight(node.depth);
    const x = columnX[node.depth] ?? leftPadding;
    const y = top + subtreeHeight / 2;
    const positioned: PositionedNode = {
      ...node,
      hasHiddenChildren: collapsedNodeIds.has(node.id) && node.children.length > 0 && children.length === 0,
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
        toX: columnX[child.depth] ?? leftPadding,
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

  const minX = nodesOut.reduce((value, node) => Math.min(value, node.x), Number.POSITIVE_INFINITY);
  const minY = nodesOut.reduce((value, node) => Math.min(value, node.y - node.height / 2), Number.POSITIVE_INFINITY);
  const maxX = nodesOut.reduce((value, node) => Math.max(value, node.x + node.width), 0);
  const maxY = nodesOut.reduce((value, node) => Math.max(value, node.y + node.height / 2), 0);
  const bounds = nodesOut.length > 0 ? { minX, minY, maxX, maxY } : { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return {
    bounds,
    connectors,
    height: Math.max(520, maxY + topPadding),
    nodes: nodesOut,
    width: Math.max(820, maxX + 140)
  };
}

function buildConnectorPath(connector: Connector) {
  const midX = connector.fromX + (connector.toX - connector.fromX) * 0.5;
  return `M ${connector.fromX} ${connector.fromY} C ${midX} ${connector.fromY}, ${midX} ${connector.toY}, ${connector.toX} ${connector.toY}`;
}

function selectedHeight(depth: number) {
  return depth <= 1 ? 32 : 30;
}

function clampZoom(value: number) {
  return Math.max(minZoom, Math.min(maxZoom, Number(value.toFixed(2))));
}

function clearNodeClickTimer(timerRef: MutableRefObject<number | null>) {
  if (timerRef.current !== null) {
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }
}

function rememberSelectedNode(storageKey: string, nodeId: string) {
  try {
    window.localStorage.setItem(storageKey, nodeId);
  } catch {
    // Local navigation memory is best-effort only.
  }
}

function buildNodeHref(basePath: string, nodeId: string) {
  return `${basePath}?node=${encodeURIComponent(nodeId)}`;
}

function findNodeTitle(nodes: KnowledgeMapNode[], nodeId: string): string {
  for (const node of nodes) {
    if (node.id === nodeId) {
      return node.title;
    }
    const childTitle = findNodeTitle(node.children, nodeId);
    if (childTitle) {
      return childTitle;
    }
  }
  return "";
}

function updateNodeTitle(nodes: KnowledgeMapNode[], nodeId: string, title: string): KnowledgeMapNode[] {
  return nodes.map((node) => {
    if (node.id === nodeId) {
      return { ...node, title };
    }
    if (node.children.length === 0) {
      return node;
    }
    return {
      ...node,
      children: updateNodeTitle(node.children, nodeId, title)
    };
  });
}

function getCollapsibleNodeIds(nodes: KnowledgeMapNode[]) {
  const ids: string[] = [];
  function walk(node: KnowledgeMapNode) {
    if (node.depth > 0 && node.children.length > 0) {
      ids.push(node.id);
    }
    for (const child of node.children) {
      walk(child);
    }
  }
  for (const node of nodes) {
    walk(node);
  }
  return ids;
}

function isMapViewMode(value: unknown): value is MapViewMode {
  return value === "mindmap" || value === "outline";
}
