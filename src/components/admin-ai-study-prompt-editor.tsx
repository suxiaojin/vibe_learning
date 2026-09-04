"use client";

import { useState } from "react";
import { CheckCircle2, Sparkles } from "lucide-react";
import {
  aiStudyPromptGroups,
  validateAiStudyPromptTemplates,
  type AiStudyPromptTemplateKey,
  type AiStudyPromptTemplates
} from "@/lib/ai-study-prompt-template";

export function AdminAiStudyPromptEditor({ initialTemplates }: { initialTemplates: AiStudyPromptTemplates }) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [checkResult, setCheckResult] = useState<string | null>(null);
  const valid = checkResult?.includes("通过") || false;

  function updateTemplate(key: AiStudyPromptTemplateKey, value: string) {
    setTemplates((current) => ({ ...current, [key]: value }));
    setCheckResult(null);
  }

  function insertVariable(key: AiStudyPromptTemplateKey, variable: string) {
    updateTemplate(key, `${templates[key]}${templates[key].endsWith("\n") || !templates[key] ? "" : "\n"}{{${variable}}}`);
  }

  function checkTemplates() {
    setCheckResult(validateAiStudyPromptTemplates(templates) || "全部15个Prompt片段检查通过，可以保存草稿。");
  }

  return (
    <div className="space-y-6">
      <div className="border border-blue-200 bg-blue-50 p-4 text-xs font-semibold leading-6 text-blue-900">
        <p className="font-black">系统强制约束不会被Prompt设置绕过</p>
        <p>JSON结构、真实sourceChunkIds、完整四层、前三层不得提前结束、最多60节点和卡片字段结构仍由程序校验。发布Prompt只调整模型生成策略。</p>
      </div>

      {aiStudyPromptGroups.map((group) => (
        <section className="border border-slate-200 bg-white" key={group.key}>
          <header className="border-b border-slate-100 bg-slate-50 px-5 py-4">
            <h3 className="text-base font-black text-ink">{group.label}</h3>
            <p className="mt-1 text-xs font-semibold text-slate-500">{group.description}</p>
          </header>
          <div className="divide-y divide-slate-100">
            {group.templates.map((definition) => (
              <label className="block p-5" key={definition.key}>
                <span className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-black text-ink">{definition.label}</span>
                  <code className="text-[11px] font-bold text-slate-400">{definition.key}</code>
                </span>
                <span className="mt-1 block text-xs font-semibold text-slate-500">{definition.description}</span>
                <textarea
                  className="input mt-3 min-h-56 rounded-none font-mono text-sm leading-6"
                  maxLength={30000}
                  name={`template:${definition.key}`}
                  required
                  value={templates[definition.key]}
                  onChange={(event) => updateTemplate(definition.key, event.target.value)}
                />
                <span className="mt-2 flex flex-wrap items-center justify-between gap-3">
                  <span className="flex flex-wrap gap-2">
                    {definition.allowedVariables.map((variable) => (
                      <button
                        className="min-h-8 border border-blue-200 bg-blue-50 px-2 font-mono text-[11px] font-bold text-blue-700 hover:border-blue-400 hover:bg-blue-100"
                        key={variable}
                        type="button"
                        onClick={() => insertVariable(definition.key, variable)}
                      >
                        {`{{${variable}}}`}
                      </button>
                    ))}
                    {definition.allowedVariables.length === 0 ? <span className="text-[11px] font-semibold text-slate-400">该片段没有动态变量</span> : null}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-400">{templates[definition.key].length} / 30000</span>
                </span>
              </label>
            ))}
          </div>
        </section>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-3 border border-slate-200 bg-white p-4">
        <p className={`flex items-center gap-2 text-xs font-bold ${valid ? "text-emerald-700" : "text-slate-500"}`} aria-live="polite">
          {valid ? <CheckCircle2 size={16} /> : null}
          {checkResult || "保存和发布时都会再次检查15个片段、必要变量与长度。"}
        </p>
        <button className="secondary-button rounded-none border-violet-200 text-violet-700 hover:bg-violet-50" type="button" onClick={checkTemplates}>
          <Sparkles size={16} />检查全部Prompt
        </button>
      </div>
    </div>
  );
}
