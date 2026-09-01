"use client";

import { Copy, X } from "lucide-react";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  copyChallengeAcrossRegion,
  previewCrossRegionChallengeCopy
} from "@/app/admin/question-banks/challenge-actions";

type TargetCourseOption = {
  id: string;
  regionName: string;
  disabled: boolean;
  disabledReason: string | null;
};

type CopyChallengeDialogProps = {
  challengeVersion: number;
  questionCount: number;
  scopeType: "chapter" | "course";
  sourceChallengeVersionId: string;
  sourceCourseName: string;
  sourceRegionName: string;
  sourceScopeId: string;
  targetCourses: TargetCourseOption[];
  targetQuestionCount: number;
};

function SubmitButton({ enabled }: { enabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className="primary-button rounded-none" disabled={pending || !enabled} type="submit">
      {pending ? "正在复制..." : "复制关卡"}
    </button>
  );
}

export function CopyChallengeDialog({
  challengeVersion,
  questionCount,
  scopeType,
  sourceChallengeVersionId,
  sourceCourseName,
  sourceRegionName,
  sourceScopeId,
  targetCourses,
  targetQuestionCount
}: CopyChallengeDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const targetId = useId();
  const availableTargets = targetCourses.filter((course) => !course.disabled);
  const [actionState, formAction] = useActionState(copyChallengeAcrossRegion, { error: null });
  const [isOpen, setIsOpen] = useState(false);
  const [targetCourseId, setTargetCourseId] = useState(availableTargets[0]?.id || "");
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewCrossRegionChallengeCopy>> | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [allowUnmapped, setAllowUnmapped] = useState(false);

  useEffect(() => {
    if (!isOpen || !targetCourseId) return;
    let cancelled = false;
    setPreview(null);
    setPreviewLoading(true);
    setAllowUnmapped(false);
    previewCrossRegionChallengeCopy(scopeType, sourceScopeId, sourceChallengeVersionId, targetCourseId)
      .then((result) => {
        if (!cancelled) setPreview(result);
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, scopeType, sourceChallengeVersionId, sourceScopeId, targetCourseId]);

  const openDialog = () => {
    if (!availableTargets.length || questionCount < 1) return;
    setTargetCourseId(availableTargets[0].id);
    setAllowUnmapped(false);
    setIsOpen(true);
    dialogRef.current?.showModal();
  };

  const unmappedCount = preview?.ok ? preview.unmappedQuestionCount : 0;
  const canSubmit = Boolean(
    preview?.ok &&
    !previewLoading &&
    (!unmappedCount || allowUnmapped)
  );
  const disabledTitle = questionCount < 1
    ? "来源关卡没有题目"
    : availableTargets.length
      ? "复制到其他区域的对应课程"
      : "其他区域没有可复制的同名课程，或闯关组织方式不一致";

  return (
    <>
      <button
        className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded border border-[#bfdbfe] bg-white px-3 text-xs font-black text-[#2563eb] hover:bg-[#eff6ff] disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 disabled:hover:bg-white"
        disabled={!availableTargets.length || questionCount < 1}
        onClick={openDialog}
        title={disabledTitle}
        type="button"
      >
        <Copy aria-hidden="true" size={14} />
        复制关卡
      </button>

      <dialog
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        className="w-[min(600px,calc(100vw-2rem))] border border-slate-300 bg-white p-0 text-left shadow-2xl backdrop:bg-slate-950/40"
        onClose={() => setIsOpen(false)}
        ref={dialogRef}
      >
        <form action={formAction}>
          <input name="scopeType" type="hidden" value={scopeType} />
          <input name="sourceScopeId" type="hidden" value={sourceScopeId} />
          <input name="sourceChallengeVersionId" type="hidden" value={sourceChallengeVersionId} />

          <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
            <div>
              <h2 className="text-lg font-black text-slate-900" id={titleId}>跨区域复制关卡</h2>
              <p className="mt-1 text-sm text-slate-500" id={descriptionId}>只匹配目标区域中内容完全一致且唯一的独立题目。</p>
            </div>
            <button
              aria-label="关闭复制关卡窗口"
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
                <span className="font-semibold text-slate-500">来源关卡</span>
                <span className="font-semibold text-slate-900">{sourceRegionName} / {sourceCourseName} / 关卡{challengeVersion}</span>
              </div>
              <div className="grid grid-cols-[88px_1fr] gap-3">
                <span className="font-semibold text-slate-500">复制内容</span>
                <span className="text-slate-700">目标题数 {targetQuestionCount}，当前题目 {questionCount} 道，并保持题目相对顺序</span>
              </div>
            </div>

            <div>
              <label className="label" htmlFor={targetId}>目标区域</label>
              <select
                className="input rounded-none"
                id={targetId}
                name="targetCourseId"
                onChange={(event) => setTargetCourseId(event.target.value)}
                required
                value={targetCourseId}
              >
                {targetCourses.map((course) => (
                  <option disabled={course.disabled} key={course.id} value={course.id}>
                    {course.regionName}{course.disabled && course.disabledReason ? `（${course.disabledReason}）` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div aria-live="polite">
              {previewLoading ? (
                <div className="border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">正在匹配目标区域题目...</div>
              ) : preview?.ok ? (
                preview.unmappedQuestionCount ? (
                  <div className="border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
                    <p className="font-bold">题目映射需要确认</p>
                    <p>来源 {preview.sourceQuestionCount} 道，可精确匹配 {preview.mappedQuestionCount} 道，无法匹配 {preview.unmappedQuestionCount} 道。</p>
                    <p>目标关卡将保存为草稿，缺少的题目需要在目标区域手动补齐。</p>
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
                      我已了解，继续复制为缺题草稿
                    </label>
                  </div>
                ) : (
                  <div className="border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900">
                    {preview.sourceQuestionCount} 道题已全部找到{preview.targetRegionName}的独立对应题目，复制后仍保存为草稿。
                  </div>
                )
              ) : preview ? (
                <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{preview.message}</div>
              ) : null}
            </div>

            {preview?.ok && preview.targetCourseStatus !== "published" ? (
              <div className="border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-900">
                目标课程当前不是“已发布”状态。关卡可以复制，但需先发布课程并补齐题目后才能保存发布关卡。
              </div>
            ) : null}

            <div className="border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
              不会引用来源区域题目，也不会复制学生进度、答题会话或历史关卡状态。
            </div>

            {actionState.error ? (
              <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" role="alert">{actionState.error}</div>
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
