"use client";

import { type KeyboardEvent, type MouseEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock3, MoreHorizontal, Pencil, Trash2, X } from "lucide-react";

type ProjectCardProps = {
  id: string;
  title: string;
  status: "draft" | "processing" | "ready" | "failed" | "archived";
  masteredCount: number;
  knowledgeCount: number;
  sourceCount: number;
  ownerName: string;
  learnerText: string;
  canManage?: boolean;
  generationPercent?: number;
  generationText?: string;
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
  masteredCount,
  knowledgeCount,
  sourceCount,
  ownerName,
  learnerText,
  canManage = false,
  generationPercent,
  generationText
}: ProjectCardProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [currentTitle, setCurrentTitle] = useState(title);
  const [draftTitle, setDraftTitle] = useState(title.slice(0, 35));
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const progressTotal = knowledgeCount || 0;
  const mastered = Math.min(masteredCount || 0, progressTotal);
  const percent = progressTotal > 0 ? Math.round((mastered / progressTotal) * 100) : 0;
  const isGenerating = status === "processing";
  const shownGenerationPercent = Math.max(1, Math.min(generationPercent || 8, 99));

  function openProject() {
    router.push(`/study-buddy/${id}`);
  }

  function handleCardClick(event: MouseEvent<HTMLElement>) {
    if ((event.target as HTMLElement).closest("[data-card-action]")) {
      return;
    }
    openProject();
  }

  function handleCardKeyDown(event: KeyboardEvent<HTMLElement>) {
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
      const response = await fetch(`/api/ai-study/projects/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
        throw new Error(payload?.error?.message || `请求失败：HTTP ${response.status}`);
      }
      setDeleteOpen(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "删除失败，请稍后重试。");
      setIsSaving(false);
    }
  }

  return (
    <>
      <article
        aria-label={`查看 ${currentTitle}`}
        className={`group relative min-h-[206px] cursor-pointer overflow-hidden rounded-[22px] border px-5 py-6 shadow-[0_18px_42px_rgba(16,24,40,0.04)] outline-none transition hover:-translate-y-0.5 hover:shadow-[0_20px_48px_rgba(16,24,40,0.08)] focus-visible:ring-4 focus-visible:ring-[#16a329]/20 ${
        isGenerating
          ? "border-[#6f786f] bg-[linear-gradient(135deg,#7b8477_0%,#5f625e_55%,#4e504e_100%)] text-white"
          : "border-[#e5e9ef] bg-white"
      }`}
        onClick={handleCardClick}
        onKeyDown={handleCardKeyDown}
        role="link"
        tabIndex={0}
      >
        {isGenerating ? (
          <span className="absolute right-4 top-4 rounded-[10px] bg-[#1f2c16]/85 px-2.5 py-1 text-[13px] font-black text-[#d8ff60] shadow-[0_8px_18px_rgba(15,23,42,0.18)]">
            {shownGenerationPercent}%
          </span>
        ) : null}
        <div className="relative z-10 flex min-h-[158px] flex-col">
          <div className="flex items-start justify-between gap-4">
            <h3 className={`line-clamp-2 pr-2 text-[19px] font-extrabold leading-[1.45] tracking-normal ${isGenerating ? "text-white" : "text-[#1d2430]"}`}>
              {currentTitle}
            </h3>
            <img
              alt=""
              className={`mt-[52px] h-[60px] w-[43px] shrink-0 rounded-[5px] object-cover shadow-[0_2px_8px_rgba(16,24,40,0.12)] ${isGenerating ? "opacity-95" : ""}`}
              height={60}
              src="/ai-study/study-material-thumb.png"
              width={43}
            />
          </div>

          <div className="mt-2">
            {status === "draft" ? (
              <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold ${statusClasses[status]}`}>
                {statusLabels[status]}
              </span>
            ) : null}
            {isGenerating ? (
              <p className="text-xs font-black text-white/90">
                {generationText || "搭子加急制作中..."}
              </p>
            ) : null}
            {status !== "draft" && !isGenerating ? (
              <p className={`text-xs font-bold ${status === "failed" ? "text-[#c93c3c]" : "text-[#10a825]"}`}>
                {mastered}/{progressTotal} 已掌握知识点
              </p>
            ) : null}
            <div className={`mt-2 h-[3px] w-[140px] overflow-hidden rounded-full ${isGenerating ? "bg-white/20" : "bg-[#edf0f2]"}`}>
              <span className={`block h-full rounded-full ${isGenerating ? "bg-[#d8ff60]" : "bg-[#20b532]"}`} style={{ width: `${isGenerating ? shownGenerationPercent : percent}%` }} />
            </div>
          </div>

          <div className={`mt-auto flex items-center justify-between gap-3 pt-5 text-[13px] ${isGenerating ? "text-white/72" : "text-[#98a2b3]"}`}>
            <div className="flex min-w-0 items-center gap-3">
              <span className="min-w-0 truncate">{ownerName}</span>
              <span className="shrink-0">{learnerText || `${sourceCount || 1}份资料`}</span>
            </div>
            {canManage ? (
              <div
                className="group/actions relative z-30 -m-3 cursor-default p-3"
                data-card-action
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              >
                <button className="grid size-7 place-items-center rounded-full bg-[#eef1f4] text-[#9aa3ae] transition hover:bg-[#e4e8ee] hover:text-[#667085]" type="button">
                  <MoreHorizontal size={18} />
                </button>
                <div className="invisible absolute bottom-10 right-3 z-40 w-[180px] translate-y-1 rounded-[12px] border border-[#edf0f4] bg-white py-2 opacity-0 shadow-[0_16px_42px_rgba(16,24,40,0.16)] transition group-hover/actions:visible group-hover/actions:translate-y-0 group-hover/actions:opacity-100 group-focus-within/actions:visible group-focus-within/actions:translate-y-0 group-focus-within/actions:opacity-100">
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
        </div>
        {isGenerating ? (
          <span className="absolute bottom-5 left-5 inline-flex items-center gap-1 rounded-full border border-white/35 px-3 py-1 text-xs font-bold text-white/90">
            <Clock3 size={12} />
            生成中
          </span>
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
  const response = await fetch(url, {
    method: "PATCH",
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
