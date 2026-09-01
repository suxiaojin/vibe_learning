"use client";

import { Copy, X } from "lucide-react";
import { useId, useRef } from "react";
import { useFormStatus } from "react-dom";
import { copyPublicSubjectCourse } from "@/app/admin/actions";

type TargetRegionOption = {
  id: string;
  name: string;
  disabled: boolean;
};

type CopyPublicSubjectCourseDialogProps = {
  chapterCount: number;
  courseId: string;
  courseName: string;
  publicSubjectId: string;
  sourceRegionName: string;
  syllabusItemCount: number;
  targetRegions: TargetRegionOption[];
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button className="primary-button rounded-none" disabled={pending} type="submit">
      {pending ? "正在复制..." : "确认复制"}
    </button>
  );
}

export function CopyPublicSubjectCourseDialog({
  chapterCount,
  courseId,
  courseName,
  publicSubjectId,
  sourceRegionName,
  syllabusItemCount,
  targetRegions
}: CopyPublicSubjectCourseDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const availableRegions = targetRegions.filter((region) => !region.disabled);

  return (
    <>
      <button
        className="inline-flex items-center gap-1 text-sm font-semibold text-[#0869a9] hover:underline disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline"
        disabled={!availableRegions.length}
        onClick={() => dialogRef.current?.showModal()}
        title={availableRegions.length ? "复制到其他区域" : "其他区域已存在同名课程，或该公共课尚未绑定其他区域"}
        type="button"
      >
        <Copy aria-hidden="true" size={14} />
        复制
      </button>

      <dialog
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        className="w-[min(560px,calc(100vw-2rem))] border border-slate-300 bg-white p-0 text-left shadow-2xl backdrop:bg-slate-950/40"
        ref={dialogRef}
      >
        <form action={copyPublicSubjectCourse}>
          <input name="sourceCourseId" type="hidden" value={courseId} />
          <input name="publicSubjectId" type="hidden" value={publicSubjectId} />

          <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
            <div>
              <h2 className="text-lg font-black text-slate-900" id={titleId}>复制课程</h2>
              <p className="mt-1 text-sm text-slate-500" id={descriptionId}>复制后生成独立副本，两个区域后续修改互不影响。</p>
            </div>
            <button
              aria-label="关闭复制课程窗口"
              className="p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              onClick={() => dialogRef.current?.close()}
              type="button"
            >
              <X aria-hidden="true" size={20} />
            </button>
          </div>

          <div className="grid gap-5 px-6 py-5">
            <div className="grid gap-3 border border-slate-200 bg-slate-50 p-4 text-sm">
              <div className="grid grid-cols-[88px_1fr] gap-3">
                <span className="font-semibold text-slate-500">来源课程</span>
                <span className="font-semibold text-slate-900">{sourceRegionName} / {courseName}</span>
              </div>
              <div className="grid grid-cols-[88px_1fr] gap-3">
                <span className="font-semibold text-slate-500">复制内容</span>
                <span className="text-slate-700">章节 {chapterCount}、考察内容 {syllabusItemCount}，以及知识点学习内容</span>
              </div>
            </div>

            <div>
              <label className="label" htmlFor={`copy-public-target-${courseId}`}>目标区域</label>
              <select className="input rounded-none" defaultValue={availableRegions[0]?.id} id={`copy-public-target-${courseId}`} name="targetRegionId" required>
                {targetRegions.map((region) => (
                  <option disabled={region.disabled} key={region.id} value={region.id}>
                    {region.name}{region.disabled ? "（已存在同名课程）" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
              新课程将保存为草稿。题库、试卷、关卡题目、学生进度、答题记录和 AI 历史不会复制。
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
            <button className="secondary-button rounded-none" onClick={() => dialogRef.current?.close()} type="button">取消</button>
            <SubmitButton />
          </div>
        </form>
      </dialog>
    </>
  );
}
