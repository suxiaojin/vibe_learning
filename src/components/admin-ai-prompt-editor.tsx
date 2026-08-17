"use client";

import { useRef, useState } from "react";
import { CheckCircle2, Sparkles } from "lucide-react";
import { aiExplainPromptVariables, validateAiExplainPrompt } from "@/lib/ai-explain-prompt-template";

export function AdminAiPromptEditor({
  initialSystemPrompt,
  initialUserPromptTemplate
}: {
  initialSystemPrompt: string;
  initialUserPromptTemplate: string;
}) {
  const [systemPrompt, setSystemPrompt] = useState(initialSystemPrompt);
  const [userPromptTemplate, setUserPromptTemplate] = useState(initialUserPromptTemplate);
  const [checkResult, setCheckResult] = useState<string | null>(null);
  const templateRef = useRef<HTMLTextAreaElement>(null);

  function insertVariable(variable: string) {
    const token = `{{${variable}}}`;
    const textarea = templateRef.current;
    const start = textarea?.selectionStart ?? userPromptTemplate.length;
    const end = textarea?.selectionEnd ?? start;
    setUserPromptTemplate(`${userPromptTemplate.slice(0, start)}${token}${userPromptTemplate.slice(end)}`);
    setCheckResult(null);
    window.requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  function checkTemplate() {
    setCheckResult(validateAiExplainPrompt(systemPrompt, userPromptTemplate) || "模板检查通过，可以保存草稿。");
  }

  const valid = checkResult?.includes("通过") || false;

  return (
    <>
      <label className="block">
        <span className="label">专业角色与规则</span>
        <textarea
          className="input mt-2 min-h-56 rounded-none font-mono text-sm leading-6"
          maxLength={12000}
          name="systemPrompt"
          required
          value={systemPrompt}
          onChange={(event) => {
            setSystemPrompt(event.target.value);
            setCheckResult(null);
          }}
        />
        <span className="mt-1 block text-right text-xs font-semibold text-slate-400">{systemPrompt.length} / 12000</span>
      </label>

      <label className="mt-5 block">
        <span className="label">答题模板</span>
        <textarea
          ref={templateRef}
          className="input mt-2 min-h-72 rounded-none font-mono text-sm leading-6"
          maxLength={20000}
          name="userPromptTemplate"
          required
          value={userPromptTemplate}
          onChange={(event) => {
            setUserPromptTemplate(event.target.value);
            setCheckResult(null);
          }}
        />
        <span className="mt-1 block text-right text-xs font-semibold text-slate-400">{userPromptTemplate.length} / 20000</span>
      </label>

      <div className="mt-4 border-t border-slate-100 pt-4">
        <p className="text-xs font-black text-slate-600">可用变量（点击插入）</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {aiExplainPromptVariables.map((variable) => (
            <button
              key={variable}
              className="min-h-9 rounded border border-blue-200 bg-blue-50 px-2.5 py-1.5 font-mono text-xs font-bold text-blue-700 transition hover:border-blue-400 hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              type="button"
              onClick={() => insertVariable(variable)}
            >
              {`{{${variable}}}`}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <p className={`flex min-h-6 items-center gap-2 text-xs font-bold ${valid ? "text-emerald-700" : "text-slate-500"}`} aria-live="polite">
          {valid ? <CheckCircle2 size={16} /> : null}
          {checkResult || "保存时会再次检查必要变量和模板长度。"}
        </p>
        <button className="secondary-button rounded-none border-violet-200 text-violet-700 hover:bg-violet-50" type="button" onClick={checkTemplate}>
          <Sparkles size={16} />
          检查模板
        </button>
      </div>
    </>
  );
}
