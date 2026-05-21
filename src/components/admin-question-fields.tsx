"use client";

import { useState } from "react";

const optionKeys = ["A", "B", "C", "D"] as const;

type QuestionType = "single_choice" | "multiple_choice" | "true_false" | "fill_blank";

type OptionValue = {
  key: string;
  text: string;
};

type AdminQuestionFieldsProps = {
  defaultType?: QuestionType;
  defaultDifficulty?: string;
  defaultStatus?: string;
  defaultSource?: string;
  defaultStem?: string;
  defaultAnalysis?: string;
  options?: unknown;
  answer?: unknown;
};

function optionText(options: unknown, key: string) {
  if (!Array.isArray(options)) {
    return "";
  }
  const option = options.find((item) => {
    if (typeof item !== "object" || item === null || !("key" in item)) {
      return false;
    }
    return String((item as { key?: unknown }).key) === key;
  }) as OptionValue | undefined;
  return option?.text || "";
}

function getInitialOptions(options: unknown, type: QuestionType) {
  const values = Object.fromEntries(optionKeys.map((key) => [key, optionText(options, key)])) as Record<(typeof optionKeys)[number], string>;
  if (!options && type === "true_false") {
    values.A = "正确";
    values.B = "错误";
  }
  return values;
}

function normalizeAnswer(answer: unknown, type: QuestionType) {
  if (Array.isArray(answer) && answer.length > 0) {
    return answer.map(String);
  }
  return type === "true_false" || type === "single_choice" ? ["A"] : [];
}

export function AdminQuestionFields({
  defaultType = "single_choice",
  defaultDifficulty = "medium",
  defaultStatus = "draft",
  defaultSource = "人工录入",
  defaultStem = "",
  defaultAnalysis = "",
  options,
  answer
}: AdminQuestionFieldsProps) {
  const [type, setType] = useState<QuestionType>(defaultType);
  const [optionValues, setOptionValues] = useState(() => getInitialOptions(options, defaultType));
  const [answers, setAnswers] = useState(() => normalizeAnswer(answer, defaultType));
  const visibleOptionKeys = type === "fill_blank" ? [] : type === "true_false" ? optionKeys.slice(0, 2) : optionKeys;

  function changeType(nextType: QuestionType) {
    setType(nextType);
    if (nextType === "true_false") {
      setOptionValues((current) => ({ ...current, A: "正确", B: "错误", C: "", D: "" }));
      setAnswers((current) => (current.includes("B") ? ["B"] : ["A"]));
      return;
    }
    if (type === "true_false") {
      setOptionValues((current) => ({ ...current, C: current.C || "", D: current.D || "" }));
    }
    if (nextType === "single_choice") {
      setAnswers((current) => [current[0] || "A"]);
    }
    if (nextType === "fill_blank") {
      setAnswers((current) => (current[0] && !optionKeys.some((key) => key === current[0]) ? current : [""]));
    }
  }

  function toggleAnswer(key: string) {
    if (type === "multiple_choice") {
      setAnswers((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
      return;
    }
    setAnswers([key]);
  }

  return (
    <>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <label className="label">题型</label>
          <select className="input" name="type" value={type} onChange={(event) => changeType(event.target.value as QuestionType)}>
            <option value="single_choice">单选</option>
            <option value="multiple_choice">多选</option>
            <option value="true_false">判断</option>
            <option value="fill_blank">填空</option>
          </select>
        </div>
        <div>
          <label className="label">难度</label>
          <select className="input" name="difficulty" defaultValue={defaultDifficulty}>
            <option value="easy">简单</option>
            <option value="medium">中等</option>
            <option value="hard">困难</option>
          </select>
        </div>
      </div>

      <label className="label mt-4">题干</label>
      <textarea className="input min-h-24" name="stem" defaultValue={defaultStem} required />

      {type === "fill_blank" ? (
        <div className="mt-4 rounded-2xl bg-mist p-4">
          <label className="text-sm font-semibold text-slate-700">答案</label>
          <textarea
            className="input mt-3 min-h-20"
            name="answer"
            value={answers[0] || ""}
            onChange={(event) => setAnswers([event.target.value])}
            required
          />
        </div>
      ) : (
        <div className="mt-4 rounded-2xl bg-mist p-4">
          <div className="flex items-center justify-between gap-3">
            <label className="text-sm font-semibold text-slate-700">选项与答案</label>
            <p className="text-xs text-slate-500">{type === "multiple_choice" ? "多选可勾多个" : "单选/判断只选一个"}</p>
          </div>
          <div className="mt-3 grid gap-3">
            {visibleOptionKeys.map((key) => (
              <div key={key} className="grid grid-cols-[48px_1fr_72px] items-center gap-2">
                <span className="font-semibold text-slate-700">{key}</span>
                <input
                  className="input"
                  name={`option${key}`}
                  value={optionValues[key]}
                  placeholder={type === "true_false" && key === "A" ? "正确" : type === "true_false" && key === "B" ? "错误" : `选项 ${key}`}
                  readOnly={type === "true_false"}
                  onChange={(event) => setOptionValues((current) => ({ ...current, [key]: event.target.value }))}
                />
                <label className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm">
                  <input
                    name="answer"
                    type={type === "multiple_choice" ? "checkbox" : "radio"}
                    value={key}
                    checked={answers.includes(key)}
                    onChange={() => toggleAnswer(key)}
                  />
                  答案
                </label>
              </div>
            ))}
            {type === "true_false" ? (
              <>
                <input type="hidden" name="optionC" value="" />
                <input type="hidden" name="optionD" value="" />
              </>
            ) : null}
          </div>
        </div>
      )}

      <label className="label mt-4">解析</label>
      <textarea className="input min-h-24" name="analysis" defaultValue={defaultAnalysis} required />

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <label className="label">来源</label>
          <input className="input" name="source" defaultValue={defaultSource} />
        </div>
        <div>
          <label className="label">状态</label>
          <select className="input" name="status" defaultValue={defaultStatus}>
            <option value="draft">待审核</option>
            <option value="published">发布</option>
            <option value="archived">下架</option>
          </select>
        </div>
      </div>
    </>
  );
}
