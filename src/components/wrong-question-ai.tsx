"use client";

import { useState } from "react";
import { HelpCircle, Loader2 } from "lucide-react";

export function WrongQuestionAi({ questionId }: { questionId: string }) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);

  async function askAi(nextPrompt?: string) {
    setOpen(true);
    setLoading(true);
    setAnswer("");
    const response = await fetch("/api/ai/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId, prompt: nextPrompt || "请针对我的错误，用通俗方式讲清楚这道题。" })
    });
    const payload = await response.json();
    setAnswer(payload.answer || payload.error || "AI 暂时无法回答，请稍后重试。");
    setLoading(false);
  }

  return (
    <div className="mt-4">
      <button className="secondary-button" type="button" onClick={() => askAi()}>
        <HelpCircle size={18} />
        AI解释
      </button>
      {open ? (
        <div className="mt-4 rounded-2xl bg-mist p-4">
          {loading ? (
            <p className="flex items-center gap-2 text-sm text-slate-600">
              <Loader2 className="animate-spin" size={16} />
              AI 正在组织讲解...
            </p>
          ) : (
            <>
              <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{answer}</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input className="input" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="继续追问这道题" />
                <button className="primary-button sm:w-24" type="button" onClick={() => askAi(prompt)}>
                  追问
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
