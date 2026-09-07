"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";
import { deleteStudentAccount } from "@/app/admin/actions";

type AdminDeleteStudentButtonProps = {
  studentId: string;
  username: string;
  returnTo: string;
};

function DeleteSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className="inline-flex min-h-11 items-center justify-center rounded-xl bg-red-600 px-5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
      type="submit"
      disabled={pending}
    >
      {pending ? "删除中..." : "确认删除"}
    </button>
  );
}

export function AdminDeleteStudentButton({
  studentId,
  username,
  returnTo
}: AdminDeleteStudentButtonProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = `delete-student-title-${studentId}`;
  const descriptionId = `delete-student-description-${studentId}`;

  return (
    <>
      <button
        className="secondary-button border-red-200 px-3 py-2 text-xs text-red-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
        type="button"
        onClick={() => dialogRef.current?.showModal()}
      >
        删除
      </button>

      <dialog
        ref={dialogRef}
        className="w-[min(92vw,480px)] rounded-2xl border border-slate-200 bg-white p-0 text-slate-700 shadow-2xl backdrop:bg-slate-950/45"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            dialogRef.current?.close();
          }
        }}
      >
        <form action={deleteStudentAccount} className="p-6">
          <input type="hidden" name="id" value={studentId} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <h2 id={titleId} className="text-lg font-bold text-ink">确认删除学生？</h2>
          <div id={descriptionId} className="mt-3 space-y-3 text-sm leading-6 text-slate-600">
            <p>
              即将永久删除学生 <strong className="font-semibold text-ink">{username}</strong>。
            </p>
            <p>
              该账号的答题记录、学习进度、错题、钻石记录、AI 学习项目和搭子社交关系将一并删除，且无法恢复。
            </p>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button
              className="secondary-button min-h-11 px-5 text-sm"
              type="button"
              autoFocus
              onClick={() => dialogRef.current?.close()}
            >
              取消
            </button>
            <DeleteSubmitButton />
          </div>
        </form>
      </dialog>
    </>
  );
}
