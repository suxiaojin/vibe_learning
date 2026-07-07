"use client";

import { type KeyboardEvent, type MouseEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pencil, RotateCcw, Trash2, X } from "lucide-react";

type ProjectStatus = "draft" | "processing" | "ready" | "failed" | "archived";

type GenerationProgress = {
  status?: ProjectStatus;
  percent?: number;
  text?: string;
};

type ProjectCardProps = {
  id: string;
  title: string;
  status: ProjectStatus;
  masteredCount: number;
  knowledgeCount: number;
  sourceCount: number;
  ownerName: string;
  learnerText: string;
  canManage?: boolean;
  contentOverview?: string;
  generationPercent?: number;
  generationText?: string;
  latestFailedRetryCount?: number;
};

const statusLabels = {
  draft: "待开始",
  processing: "生成中",
  ready: "学习中",
  failed: "生成失败",
  archived: "已归档"
};

const statusClasses = {
  draft: "bg-[#14a61f] text-white",
  processing: "bg-[#fff4d6] text-[#a56800]",
  ready: "bg-[#eaf8ec] text-[#12a425]",
  failed: "bg-[#ffe7e7] text-[#c93c3c]",
  archived: "bg-[#eef1f5] text-[#8b95a1]"
};

export function AiStudyProjectCard({
  id,
  title,
  status,
  contentOverview = "",
  canManage = false,
  generationPercent,
  generationText,
  latestFailedRetryCount = 0
}: ProjectCardProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [currentTitle, setCurrentTitle] = useState(title);
  const [draftTitle, setDraftTitle] = useState(title.slice(0, 35));
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isTitleOverflowing, setIsTitleOverflowing] = useState(false);
  const [error, setError] = useState("");
  const [displayStatus, setDisplayStatus] = useState(status);
  const [displayGeneration, setDisplayGeneration] = useState<GenerationProgress>({
    percent: generationPercent,
    text: generationText
  });
  const terminalRefreshRef = useRef<ProjectStatus | null>(status === "processing" ? null : status);

  useEffect(() => {
    setDisplayStatus(status);
    setDisplayGeneration({
      percent: generationPercent,
      text: generationText
    });
    setIsRetrying(false);
    terminalRefreshRef.current = status === "processing" ? null : status;
  }, [generationPercent, generationText, status]);

  useEffect(() => {
    const titleElement = titleRef.current;
    if (!titleElement) {
      return;
    }
    const measuredTitleElement = titleElement;

    function updateTitleOverflow() {
      setIsTitleOverflowing(
        measuredTitleElement.scrollHeight > measuredTitleElement.clientHeight + 1 ||
          measuredTitleElement.scrollWidth > measuredTitleElement.clientWidth + 1
      );
    }

    updateTitleOverflow();
    window.addEventListener("resize", updateTitleOverflow);
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateTitleOverflow);
    resizeObserver?.observe(measuredTitleElement);

    return () => {
      window.removeEventListener("resize", updateTitleOverflow);
      resizeObserver?.disconnect();
    };
  }, [currentTitle]);

  useEffect(() => {
    if (status !== "processing") {
      return;
    }

    let disposed = false;
    let timer: number | null = null;

    async function pollProgress() {
      try {
        const progress = await fetchAiStudyProjectProgress(id);
        if (disposed) {
          return;
        }

        setDisplayGeneration({
          percent: progress.percent,
          text: progress.text
        });

        if (progress.status) {
          setDisplayStatus(progress.status);
        }

        if (progress.status === "ready" || progress.status === "failed") {
          if (terminalRefreshRef.current !== progress.status) {
            terminalRefreshRef.current = progress.status;
            router.refresh();
          }
          return;
        }
      } catch {
        // Keep the current card state; the next poll or a manual refresh can recover.
      }

      if (!disposed) {
        timer = window.setTimeout(pollProgress, 3000);
      }
    }

    void pollProgress();

    return () => {
      disposed = true;
      if (timer) {
        window.clearTimeout(timer);
      }
    };
  }, [id, router, status]);

  const isGenerating = displayStatus === "processing";
  const isFailed = displayStatus === "failed";
  const canOpenProject = !isGenerating && !isFailed;
  const isRetryLimitReached = isFailed && latestFailedRetryCount >= 3;
  const failedDisplayText = isRetryLimitReached ? "无法解析此文档，请删除" : (displayGeneration.text || statusLabels.failed);
  const shownGenerationPercent = Math.max(1, Math.min(displayGeneration.percent || 8, 99));
  const overviewText = contentOverview.trim() || "暂无内容概述";

  function openProject() {
    if (!canOpenProject) {
      return;
    }
    router.push(`/study-buddy/${id}`);
  }

  function handleCardClick(event: MouseEvent<HTMLElement>) {
    if (!canOpenProject) {
      return;
    }
    if ((event.target as HTMLElement).closest("[data-card-action]")) {
      return;
    }
    openProject();
  }

  function handleCardKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!canOpenProject) {
      return;
    }
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    if ((event.target as HTMLElement).closest("[data-card-action]")) {
      return;
    }
    event.preventDefault();
    openProject();
  }

  function openRename() {
    if (!canManage) {
      return;
    }
    setDraftTitle(currentTitle.slice(0, 35));
    setError("");
    setRenameOpen(true);
    window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 30);
  }

  async function renameProject() {
    const nextTitle = draftTitle.trim();
    if (!nextTitle || isSaving) {
      return;
    }

    setIsSaving(true);
    setError("");
    try {
      await patchJson(`/api/ai-study/projects/${id}`, { title: nextTitle });
      setCurrentTitle(nextTitle);
      setRenameOpen(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "重命名失败，请稍后重试。");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteProject() {
    if (!canManage || isSaving) {
      return;
    }

    setIsSaving(true);
    setError("");
    try {
      await deleteProjectRequest(id);
      setDeleteOpen(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "删除失败，请稍后重试。");
      setIsSaving(false);
    }
  }

  async function cancelGeneratingProject(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    if (!canManage || isSaving) {
      return;
    }

    setIsSaving(true);
    setError("");
    try {
      await deleteProjectRequest(id);
      setDisplayStatus("archived");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "取消失败，请稍后重试。");
      setIsSaving(false);
    }
  }

  async function retryProject(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    if (!canManage || isRetrying || isRetryLimitReached) {
      return;
    }

    setIsRetrying(true);
    setError("");
    try {
      await postJson(`/api/ai-study/projects/${id}/retry`, {});
      setDisplayStatus("processing");
      setDisplayGeneration({
        percent: displayGeneration.percent && displayGeneration.percent < 100 ? displayGeneration.percent : 8,
        text: "正在重新生成..."
      });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "重新生成失败，请稍后重试。");
      setIsRetrying(false);
    }
  }

  return (
    <>
      <article
        aria-label={canOpenProject ? `查看 ${currentTitle}` : currentTitle}
        className={`group relative h-[206px] w-full max-w-[284px] overflow-visible rounded-[24px] border p-5 shadow-[0_2px_30px_rgba(83,108,143,0.04)] outline-none transition focus-visible:ring-4 focus-visible:ring-[#16a329]/20 ${
          isGenerating
            ? "cursor-default border-[#6f786f] bg-[linear-gradient(135deg,#7b8477_0%,#5f625e_55%,#4e504e_100%)] text-white"
            : canOpenProject
              ? "cursor-pointer border-[#eeeeee] bg-white hover:-translate-y-0.5 hover:shadow-[0_8px_32px_rgba(83,108,143,0.08)]"
              : "cursor-default border-[#eeeeee] bg-white"
        }`}
        onClick={handleCardClick}
        onKeyDown={handleCardKeyDown}
        role={canOpenProject ? "link" : "article"}
        tabIndex={canOpenProject ? 0 : -1}
      >
        {isGenerating ? (
          <span className="absolute right-4 top-4 rounded-[10px] bg-[#1f2c16]/85 px-2.5 py-1 text-[13px] font-black text-[#d8ff60] shadow-[0_8px_18px_rgba(15,23,42,0.18)]">
            {shownGenerationPercent}%
          </span>
        ) : null}
        {isTitleOverflowing ? (
          <div className="pointer-events-none invisible absolute -top-[52px] left-0 z-50 max-w-[340px] rounded-[4px] bg-[#111827] px-2.5 py-2 text-[12px] font-semibold leading-[1.45] text-white opacity-0 shadow-[0_10px_24px_rgba(15,23,42,0.22)] transition duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
            {currentTitle}
          </div>
        ) : null}
        <div className="relative z-10 h-full">
          <h3 ref={titleRef} className={`line-clamp-2 pr-[74px] text-[19px] font-semibold leading-[1.45] tracking-normal ${isGenerating ? "text-white" : "text-[#1d2430]"}`}>
            {currentTitle}
          </h3>
          <img
            alt=""
            className={`absolute bottom-[42px] right-0 h-[58px] w-[43px] rounded-[8px] border border-[#edf0f2] bg-white object-cover shadow-[0_3px_10px_rgba(16,24,40,0.10)] ${isGenerating ? "opacity-95" : ""}`}
            height={60}
            src="/ai-study/study-material-thumb.png"
            width={43}
          />

          <div className="mt-3 w-[172px]">
            {displayStatus === "draft" ? (
              <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold ${statusClasses[displayStatus]}`}>
                {statusLabels[displayStatus]}
              </span>
            ) : null}
            {isGenerating ? (
              <p className="truncate text-[12px] font-black leading-4 text-white/90">
                <AnimatedTrailingDotsText text={displayGeneration.text || "正在解析资料..."} />
              </p>
            ) : null}
            {displayStatus === "failed" ? (
              <div className="flex h-4 items-center gap-1.5">
                <p className="min-w-0 truncate text-[12px] font-bold leading-4 text-[#f04438]">
                  {failedDisplayText}
                </p>
                {canManage && !isRetryLimitReached ? (
                  <div className="group/retry relative inline-flex h-6 items-center" data-card-action>
                    <button
                      aria-label="重新生成"
                      className="grid size-6 place-items-center rounded-full border border-[#bdecc6] bg-white text-[#12a425] transition hover:border-[#12a425] hover:bg-[#effaf1] hover:text-[#0f8f20] disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={isRetrying}
                      onClick={retryProject}
                      title="重新生成"
                      type="button"
                    >
                      <RotateCcw className={isRetrying ? "animate-spin" : ""} size={13} />
                    </button>
                    <span className="pointer-events-none absolute left-7 top-1/2 -translate-y-1/2 whitespace-nowrap text-[12px] font-bold text-[#12a425] opacity-0 transition-opacity duration-150 group-hover/retry:opacity-100 group-focus-within/retry:opacity-100">
                      重新生成
                    </span>
                  </div>
                ) : null}
              </div>
            ) : null}
            {displayStatus !== "draft" && displayStatus !== "failed" && !isGenerating ? (
              <p className="line-clamp-2 text-[13px] font-medium leading-[20px] text-[#667085] transition-all duration-150 group-hover:line-clamp-4">
                {overviewText}
              </p>
            ) : null}
            {isGenerating ? (
              <div className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-white/20">
                <span className="block h-full rounded-full bg-[#d8ff60]" style={{ width: `${shownGenerationPercent}%` }} />
              </div>
            ) : null}
          </div>

          {!isGenerating ? (
            <div className="absolute bottom-0 left-0 right-0 flex h-7 items-center justify-between gap-3 text-[13px] leading-none text-[#98a2b3]">
              <div className="min-w-0 pr-2">
                <span className="block truncate">AI生成，注意核实</span>
              </div>
              {canManage ? (
                <div
                  className="group/actions relative z-30 cursor-default"
                  data-card-action
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  <button className="grid size-7 place-items-center rounded-full text-[#b5beca] transition hover:bg-[#f1f4f7] hover:text-[#667085]" type="button">
                    <MoreHorizontal size={18} />
                  </button>
                  <div className="invisible absolute bottom-9 right-0 z-40 w-[180px] translate-y-1 rounded-[12px] border border-[#edf0f4] bg-white py-2 opacity-0 shadow-[0_16px_42px_rgba(16,24,40,0.16)] transition group-hover/actions:visible group-hover/actions:translate-y-0 group-hover/actions:opacity-100 group-focus-within/actions:visible group-focus-within/actions:translate-y-0 group-focus-within/actions:opacity-100">
                    <button className="flex h-11 w-full items-center gap-3 px-4 text-left text-[15px] font-medium text-[#1d2430] hover:bg-[#f7f8fa]" onClick={openRename} type="button">
                      <Pencil size={17} />
                      重命名
                    </button>
                    <button className="flex h-11 w-full items-center gap-3 px-4 text-left text-[15px] font-medium text-[#1d2430] hover:bg-[#fff4f4]" onClick={() => setDeleteOpen(true)} type="button">
                      <Trash2 size={17} />
                      删除项目
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        {isGenerating ? (
          <div className="absolute bottom-5 left-5 right-5 z-20">
            {canManage ? (
              <button
                className="absolute bottom-0 right-0 z-30 h-8 min-w-[56px] rounded-[10px] border border-white/75 px-3 text-[12px] font-black text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                data-card-action
                disabled={isSaving}
                onClick={cancelGeneratingProject}
                type="button"
              >
                {isSaving ? "取消中" : "取消"}
              </button>
            ) : null}
          </div>
        ) : null}
      </article>

      {renameOpen ? (
        <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/50 px-4 pt-[165px]">
          <div className="w-full max-w-[428px] rounded-[10px] bg-white px-6 pb-6 pt-5 shadow-[0_24px_72px_rgba(15,23,42,0.22)]">
            <div className="flex items-center justify-between">
              <h2 className="text-[22px] font-black tracking-normal text-[#101828]">编辑项目名称</h2>
              <button className="grid size-8 place-items-center rounded-full text-[#111827] transition hover:bg-[#f2f4f7]" onClick={() => setRenameOpen(false)} type="button">
                <X size={20} />
              </button>
            </div>
            <div className="relative mt-5">
              <input
                ref={inputRef}
                className="h-10 w-full rounded-[10px] border border-[#1d2430] bg-white px-3 pr-14 text-[14px] font-medium text-[#15223b] outline-none"
                maxLength={35}
                onChange={(event) => setDraftTitle(event.target.value)}
                value={draftTitle}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-medium text-[#98a2b3]">{draftTitle.length}/35</span>
            </div>
            {error ? <p className="mt-3 text-sm font-semibold text-[#d92d20]">{error}</p> : null}
            <div className="mt-6 flex justify-end gap-6">
              <button className="h-10 w-[94px] rounded-[9px] border border-[#d3d9e4] bg-white text-[15px] font-bold text-[#344054] transition hover:bg-[#f8fafc]" disabled={isSaving} onClick={() => setRenameOpen(false)} type="button">
                取消
              </button>
              <button className="h-10 w-[94px] rounded-[9px] bg-[#91a5ff] text-[15px] font-bold text-white transition hover:bg-[#8298fb] disabled:cursor-not-allowed disabled:opacity-60" disabled={isSaving || !draftTitle.trim()} onClick={renameProject} type="button">
                确认
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteOpen ? (
        <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/50 px-4 pt-[165px]">
          <div className="w-full max-w-[432px] rounded-[10px] bg-white px-6 pb-6 pt-5 shadow-[0_24px_72px_rgba(15,23,42,0.22)]">
            <div className="flex items-center justify-between">
              <h2 className="text-[22px] font-black tracking-normal text-[#101828]">提示</h2>
              <button className="grid size-8 place-items-center rounded-full text-[#111827] transition hover:bg-[#f2f4f7]" disabled={isSaving} onClick={() => setDeleteOpen(false)} type="button">
                <X size={20} />
              </button>
            </div>
            <p className="mt-7 text-[14px] font-medium text-[#344054]">删除后项目以及学习进度无法恢复，是否确认删除？</p>
            {error ? <p className="mt-3 text-sm font-semibold text-[#d92d20]">{error}</p> : null}
            <div className="mt-12 flex justify-end gap-6">
              <button className="h-10 w-[94px] rounded-[9px] border border-[#d3d9e4] bg-white text-[15px] font-bold text-[#344054] transition hover:bg-[#f8fafc]" disabled={isSaving} onClick={() => setDeleteOpen(false)} type="button">
                取消
              </button>
              <button className="h-10 w-[94px] rounded-[9px] bg-[#ff4d55] text-[15px] font-bold text-white transition hover:bg-[#f13f48] disabled:cursor-not-allowed disabled:opacity-60" disabled={isSaving} onClick={deleteProject} type="button">
                确认删除
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

async function patchJson(url: string, body: unknown) {
  return sendJson("PATCH", url, body);
}

async function postJson(url: string, body: unknown) {
  return sendJson("POST", url, body);
}

async function sendJson(method: "PATCH" | "POST", url: string, body: unknown) {
  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => null) as { ok?: boolean; error?: { message?: string } } | null;
  if (response.ok && payload?.ok) {
    return payload;
  }
  throw new Error(payload?.error?.message || `请求失败：HTTP ${response.status}`);
}

async function deleteProjectRequest(projectId: string) {
  const response = await fetch(`/api/ai-study/projects/${projectId}`, { method: "DELETE" });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(payload?.error?.message || `请求失败：HTTP ${response.status}`);
  }
}

async function fetchAiStudyProjectProgress(projectId: string) {
  const response = await fetch(`/api/ai-study/projects/${projectId}/progress`, {
    cache: "no-store"
  });
  const payload = await response.json().catch(() => null) as {
    ok?: boolean;
    data?: { generationProgress?: GenerationProgress };
    error?: { message?: string };
  } | null;

  if (response.ok && payload?.ok && payload.data?.generationProgress) {
    return payload.data.generationProgress;
  }

  throw new Error(payload?.error?.message || `请求失败：HTTP ${response.status}`);
}

function AnimatedTrailingDotsText({ text }: { text: string }) {
  const trimmedText = text.trim();
  const match = trimmedText.match(/^(.*?)([.。…]{1,3})$/);
  const baseText = match ? match[1].trimEnd() : trimmedText;

  return (
    <>
      <span>{baseText}</span>
      {match ? (
        <span className="ml-0.5 inline-flex w-3 justify-between align-baseline" aria-hidden="true">
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              className="inline-block animate-bounce leading-none"
              style={{ animationDelay: `${index * 120}ms`, animationDuration: "900ms" }}
            >
              .
            </span>
          ))}
        </span>
      ) : null}
    </>
  );
}
