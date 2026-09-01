"use client";

import Link from "next/link";
import { Copy, X } from "lucide-react";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { copyQuestionBankPaper, previewQuestionBankCopy } from "@/app/admin/actions";

type ContentStatus = "draft" | "published" | "archived";

type TargetRegionOption = {
  id: string;
  name: string;
  province: string;
};

type CopyQuestionBankDialogProps = {
  courseManagementHref: string;
  ownerId: string;
  ownerType: "major" | "public_subject";
  paperId: string;
  paperTitle: string;
  paperYear: number | null;
  questionCount: number;
  sourceRegionName: string;
  sourceRegionProvince: string;
  sourceStatus: ContentStatus;
  targetRegions: TargetRegionOption[];
};

function statusLabel(status: ContentStatus) {
  if (status === "published") return "启用";
  if (status === "archived") return "停用";
  return "草稿";
}

function suggestedTitle(
  sourceTitle: string,
  sourceRegionName: string,
  sourceRegionProvince: string,
  targetRegion: TargetRegionOption | undefined
) {
  if (!targetRegion) return sourceTitle;
  if (sourceRegionName && sourceTitle.includes(sourceRegionName)) {
    return sourceTitle.replace(sourceRegionName, targetRegion.name);
  }
  if (sourceRegionProvince && sourceTitle.includes(sourceRegionProvince)) {
    return sourceTitle.replace(sourceRegionProvince, targetRegion.province);
  }
  return sourceTitle;
}

function SubmitButton({ enabled }: { enabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className="primary-button rounded-none" disabled={pending || !enabled} type="submit">
      {pending ? "正在复制..." : "复制题库"}
    </button>
  );
}

export function CopyQuestionBankDialog({
  courseManagementHref,
  ownerId,
  ownerType,
  paperId,
  paperTitle,
  paperYear,
  questionCount,
  sourceRegionName,
  sourceRegionProvince,
  sourceStatus,
  targetRegions
}: CopyQuestionBankDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const targetRegionId = useId();
  const paperTitleId = useId();
  const yearId = useId();
  const statusId = useId();
  const [actionState, formAction] = useActionState(copyQuestionBankPaper, { error: null });
  const [isOpen, setIsOpen] = useState(false);
  const [selectedTargetRegionId, setSelectedTargetRegionId] = useState(targetRegions[0]?.id || "");
  const [copyTitle, setCopyTitle] = useState(
    suggestedTitle(paperTitle, sourceRegionName, sourceRegionProvince, targetRegions[0])
  );
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewQuestionBankCopy>> | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [allowUnmapped, setAllowUnmapped] = useState(false);
  const selectedTargetRegion = targetRegions.find((region) => region.id === selectedTargetRegionId);

  useEffect(() => {
    if (!isOpen || !selectedTargetRegionId) return;
    let cancelled = false;
    setPreview(null);
    setPreviewLoading(true);
    setAllowUnmapped(false);
    previewQuestionBankCopy(ownerType, ownerId, paperId, selectedTargetRegionId)
      .then((result) => {
        if (!cancelled) setPreview(result);
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, ownerId, ownerType, paperId, selectedTargetRegionId]);

  const openDialog = () => {
    const firstRegion = targetRegions[0];
    if (!firstRegion) return;
    setSelectedTargetRegionId(firstRegion.id);
    setCopyTitle(suggestedTitle(paperTitle, sourceRegionName, sourceRegionProvince, firstRegion));
    setAllowUnmapped(false);
    setIsOpen(true);
    dialogRef.current?.showModal();
  };

  const handleTargetChange = (regionId: string) => {
    const region = targetRegions.find((item) => item.id === regionId);
    setSelectedTargetRegionId(regionId);
    setCopyTitle(suggestedTitle(paperTitle, sourceRegionName, sourceRegionProvince, region));
  };

  const unmappedCount = preview?.ok ? preview.summary.unmappedAssociationCount : 0;
  const canSubmit = Boolean(
    preview?.ok &&
    !previewLoading &&
    copyTitle.trim() &&
    (!unmappedCount || allowUnmapped)
  );

  return (
    <>
      <button
        className="inline-flex items-center gap-1 text-[#006aff] hover:underline disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline"
        disabled={!targetRegions.length}
        onClick={openDialog}
        title={targetRegions.length ? "复制到其他已绑定区域" : "当前专业或公共课未绑定其他区域"}
        type="button"
      >
        <Copy aria-hidden="true" size={14} />
        复制
      </button>

      <dialog
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        className="w-[min(620px,calc(100vw-2rem))] border border-slate-300 bg-white p-0 text-left shadow-2xl backdrop:bg-slate-950/40"
        onClose={() => setIsOpen(false)}
        ref={dialogRef}
      >
        <form action={formAction}>
          <input name="sourcePaperId" type="hidden" value={paperId} />
          <input name="ownerType" type="hidden" value={ownerType} />
          <input name="ownerId" type="hidden" value={ownerId} />

          <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
            <div>
              <h2 className="text-lg font-black text-slate-900" id={titleId}>复制题库</h2>
              <p className="mt-1 text-sm text-slate-500" id={descriptionId}>
                题目和可匹配的知识点关联将生成独立副本，后续修改互不影响。
              </p>
            </div>
            <button
              aria-label="关闭复制题库窗口"
              className="p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              onClick={() => dialogRef.current?.close()}
              type="button"
            >
              <X aria-hidden="true" size={20} />
            </button>
          </div>

          <div className="grid max-h-[70vh] gap-5 overflow-y-auto px-6 py-5">
            <div className="grid gap-3 border border-slate-200 bg-slate-50 p-4 text-sm">
              <div className="grid grid-cols-[88px_1fr] gap-3">
                <span className="font-semibold text-slate-500">来源题库</span>
                <span className="font-semibold text-slate-900">{sourceRegionName} / {paperTitle}</span>
              </div>
              <div className="grid grid-cols-[88px_1fr] gap-3">
                <span className="font-semibold text-slate-500">复制内容</span>
                <span className="text-slate-700">{questionCount} 道题、题目顺序与分值、题目状态和知识点关联</span>
              </div>
              <div className="grid grid-cols-[88px_1fr] gap-3">
                <span className="font-semibold text-slate-500">当前状态</span>
                <span className="text-slate-700">{statusLabel(sourceStatus)}</span>
              </div>
            </div>

            <div>
              <label className="label" htmlFor={targetRegionId}>目标区域</label>
              <select
                className="input rounded-none"
                id={targetRegionId}
                name="targetRegionId"
                onChange={(event) => handleTargetChange(event.target.value)}
                required
                value={selectedTargetRegionId}
              >
                {targetRegions.map((region) => (
                  <option key={region.id} value={region.id}>{region.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="label" htmlFor={paperTitleId}>题库名称</label>
              <input
                className="input rounded-none"
                id={paperTitleId}
                name="title"
                onChange={(event) => setCopyTitle(event.target.value)}
                required
                value={copyTitle}
              />
            </div>

            <div className="grid grid-cols-[1fr_1fr] gap-3">
              <div>
                <label className="label" htmlFor={yearId}>年份</label>
                <input
                  className="input rounded-none"
                  defaultValue={paperYear || ""}
                  id={yearId}
                  max="2100"
                  min="2000"
                  name="year"
                  placeholder="2026"
                  type="number"
                />
              </div>
              <div>
                <label className="label" htmlFor={statusId}>复制后状态</label>
                <select className="input rounded-none" defaultValue={sourceStatus} id={statusId} name="status">
                  <option value="published">启用</option>
                  <option value="archived">停用</option>
                  <option value="draft">草稿</option>
                </select>
              </div>
            </div>

            <div aria-live="polite">
              {previewLoading ? (
                <div className="border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">正在检查目标区域的知识点匹配情况...</div>
              ) : preview?.ok ? (
                preview.summary.unmappedAssociationCount ? (
                  <div className="border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
                    <p className="font-bold">知识点关联需要确认</p>
                    <p>
                      可匹配 {preview.summary.mappedAssociationCount} 项，无法匹配 {preview.summary.unmappedAssociationCount} 项，
                      涉及 {preview.summary.questionsWithUnmappedAssociations} 道题。无法匹配的部分将标记为未归类。
                    </p>
                    <p className="mt-1">
                      可以先<Link className="mx-1 font-bold text-[#006aff] underline" href={courseManagementHref}>完善目标区域课程目录</Link>再复制。
                    </p>
                    <label className="mt-2 flex items-start gap-2 font-semibold">
                      <input
                        checked={allowUnmapped}
                        className="mt-1 size-4"
                        name="allowUnmapped"
                        onChange={(event) => setAllowUnmapped(event.target.checked)}
                        required
                        type="checkbox"
                        value="yes"
                      />
                      我已了解，继续复制并将无法匹配的关联标记为未归类
                    </label>
                  </div>
                ) : (
                  <div className="border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900">
                    知识点检查完成：{preview.summary.mappedAssociationCount} 项关联可全部匹配。
                    {preview.summary.unclassifiedQuestionCount ? ` 来源题库另有 ${preview.summary.unclassifiedQuestionCount} 道题原本未归类。` : ""}
                  </div>
                )
              ) : preview ? (
                <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{preview.message}</div>
              ) : null}
            </div>

            <div className="border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-900">
              学生答题记录、错题记录、学习进度和 AI 对话不会复制。目标区域：{selectedTargetRegion?.name || "-"}。
            </div>

            {actionState.error ? (
              <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" role="alert">
                {actionState.error}
              </div>
            ) : null}
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
            <button className="secondary-button rounded-none" onClick={() => dialogRef.current?.close()} type="button">取消</button>
            <SubmitButton enabled={canSubmit} />
          </div>
        </form>
      </dialog>
    </>
  );
}
