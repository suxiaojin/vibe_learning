"use client";

import { startTransition, useActionState, useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, BookOpenText, Check, Lock, RotateCcw, Save, Sparkles } from "lucide-react";
import { updateLearningPathThemeSettings, type LearningPathThemeFormState } from "@/app/admin/settings/learning-path-theme-actions";
import { defaultLearningPathThemeKey, getLearningPathTheme, getLearningPathThemeStyle, learningPathThemes, type LearningPathThemeKey } from "@/lib/learning-path-theme";
import { cn } from "@/lib/utils";

const initialState: LearningPathThemeFormState = { status: "idle", message: "" };

export function AdminLearningPathThemeSettings({ currentThemeKey }: { currentThemeKey: string }) {
  const currentTheme = getLearningPathTheme(currentThemeKey);
  const [selectedKey, setSelectedKey] = useState<LearningPathThemeKey>(currentTheme.key);
  const [savedKey, setSavedKey] = useState<LearningPathThemeKey>(currentTheme.key);
  const [state, formAction, pending] = useActionState(updateLearningPathThemeSettings, initialState);
  const selectedTheme = getLearningPathTheme(selectedKey);
  const hasChanges = selectedKey !== savedKey;

  useEffect(() => {
    setSavedKey(currentTheme.key);
  }, [currentTheme.key]);

  useEffect(() => {
    if (state.status === "success" && state.savedThemeKey) {
      setSavedKey(state.savedThemeKey);
    }
  }, [state]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("learningPathTheme", selectedKey);
    // Keep the controlled draft intact, including when the server rejects a save.
    startTransition(() => formAction(formData));
  }

  return (
    <section className="border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="learning-path-theme-title">
      <div className="border-b border-slate-100 pb-4">
        <h2 className="text-lg font-black text-ink" id="learning-path-theme-title">闯关颜色</h2>
        <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
          统一设置所有课程的闯关地图、关卡列表和指南页配色，锁定关卡及答题对错颜色不变。
        </p>
      </div>

      <form
        className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]"
        onSubmit={handleSubmit}
      >
        <div className="min-w-0">
          <fieldset disabled={pending}>
            <legend className="text-sm font-semibold text-slate-700">选择配色</legend>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {learningPathThemes.map((theme) => (
                <label
                  className={cn(
                    "min-w-0 cursor-pointer rounded-lg border p-3 transition focus-within:ring-2 focus-within:ring-teal/40",
                    selectedKey === theme.key ? "border-teal bg-teal/5" : "border-slate-200 hover:border-teal/50",
                    pending && "cursor-wait opacity-60"
                  )}
                  key={theme.key}
                >
                  <span className="mb-3 block h-10 rounded border-b-4" style={{ backgroundColor: theme.primary, borderColor: theme.strong }} aria-hidden="true" />
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-ink">{theme.name}</span>
                    <input
                      checked={selectedKey === theme.key}
                      className="size-4 shrink-0 accent-teal"
                      name="learningPathTheme"
                      onChange={() => setSelectedKey(theme.key)}
                      type="radio"
                      value={theme.key}
                    />
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">{theme.primary}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <p className="mt-4 text-xs leading-5 text-slate-500">
            当前已保存：{getLearningPathTheme(savedKey).name}。选色只更新预览，确认保存后全站生效。
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              className="primary-button rounded-none disabled:cursor-not-allowed disabled:opacity-50"
              disabled={pending || !hasChanges}
              type="submit"
            >
              <Save size={16} />
              {pending ? "保存中..." : "确认保存"}
            </button>
            <button
              className="secondary-button rounded-none disabled:cursor-not-allowed disabled:opacity-50"
              disabled={pending || selectedKey === defaultLearningPathThemeKey}
              onClick={() => setSelectedKey(defaultLearningPathThemeKey)}
              type="button"
            >
              <RotateCcw size={16} />
              恢复默认绿色
            </button>
          </div>
          {state.status === "error" ? (
            <p className="mt-3 text-sm text-red-700" role="alert">{state.message}</p>
          ) : (
            <p className="mt-3 text-sm leading-6 text-slate-600" role="status" aria-live="polite">
              {pending ? "正在保存闯关颜色..." : hasChanges ? `正在预览：${selectedTheme.name}，尚未保存。` : state.message}
            </p>
          )}
        </div>

        <div className="min-w-0">
          <p className="mb-3 text-sm font-semibold text-slate-700">效果预览 · {selectedTheme.name}</p>
          <LearningPathThemePreview themeKey={selectedKey} />
        </div>
      </form>
    </section>
  );
}

export function LearningPathThemePreview({ themeKey }: { themeKey: string }) {
  const theme = getLearningPathTheme(themeKey);
  return (
    <div className="rounded-xl bg-mist p-4" style={getLearningPathThemeStyle(theme.key)}>
      <div className="rounded-xl border-b-8 border-[var(--challenge-strong)] bg-[var(--challenge-primary)] p-4 text-white">
        <div className="flex items-center gap-1 text-xs"><ArrowLeft size={14} />经济学基础</div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-bold">经济学概述</h3>
          <span className={cn("inline-flex items-center gap-1 rounded-lg border border-white/25 px-2 py-2 text-xs", theme.key === "default" ? "bg-white/10" : "bg-black/10")}>
            <BookOpenText size={16} />指南
          </span>
        </div>
      </div>
      <div className="mt-6 text-center">
        <p className="text-xs text-slate-500">章节关卡</p>
        <p className="mt-1 text-sm font-semibold text-slate-600">经济学基础</p>
      </div>
      <div className="mt-6 grid grid-cols-3 gap-3 pb-3 text-center text-xs text-slate-600">
        <div className="flex flex-col items-center gap-3">
          <span className="grid size-14 place-items-center rounded-full border-b-4 border-[var(--challenge-strong)] bg-[var(--challenge-primary)] text-white"><Check size={26} strokeWidth={4} /></span>
          <span>已通过</span>
        </div>
        <div className="flex flex-col items-center gap-3">
          <span className="grid size-14 place-items-center rounded-full border-b-4 border-[var(--challenge-strong)] bg-[var(--challenge-primary)] text-white ring-4 ring-[var(--challenge-ring)]"><Sparkles size={24} /></span>
          <span>可闯关</span>
        </div>
        <div className="flex flex-col items-center gap-3">
          <span className="grid size-14 place-items-center rounded-full border-b-4 border-slate-300 bg-slate-200 text-slate-400"><Lock size={24} /></span>
          <span>未解锁</span>
        </div>
      </div>
    </div>
  );
}
