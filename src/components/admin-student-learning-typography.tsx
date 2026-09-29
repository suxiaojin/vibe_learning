"use client";

import { useState } from "react";
import { Save } from "lucide-react";
import {
  getStudentLearningFontFamilyCss,
  getStudentLearningFontSizePixels,
  isStudentLearningFontFamily,
  isStudentLearningFontSize,
  studentLearningFontSizeDefault,
  studentLearningFontSizeMax,
  studentLearningFontSizeMin,
  studentLearningFontFamilies
} from "@/lib/student-learning-typography";

export function AdminStudentLearningTypography({
  action,
  currentFontFamily,
  currentFontSize
}: {
  action: (formData: FormData) => Promise<void>;
  currentFontFamily: string;
  currentFontSize: string;
}) {
  const [fontFamily, setFontFamily] = useState(
    isStudentLearningFontFamily(currentFontFamily) ? currentFontFamily : "system"
  );
  const [fontSize, setFontSize] = useState(
    isStudentLearningFontSize(currentFontSize) ? currentFontSize : String(studentLearningFontSizeDefault)
  );

  return (
    <form action={action} className="border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-lg font-black text-ink">学生端字体字号</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">调整学生端页面的字体和基础字号，管理员后台不受影响。</p>
        </div>
        <button className="primary-button rounded-none" type="submit">
          <Save size={16} />
          保存设置
        </button>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <label className="block">
          <span className="label">字体</span>
          <select
            className="input rounded-none"
            name="studentLearningFontFamily"
            onChange={(event) => setFontFamily(event.target.value as typeof fontFamily)}
            value={fontFamily}
          >
            {studentLearningFontFamilies.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <span className="mt-1.5 block text-xs font-semibold text-slate-500">字体会按设备已安装情况自动回退。</span>
        </label>

        <label className="block">
          <span className="label">字号（px）</span>
          <input
            className="input rounded-none"
            inputMode="numeric"
            max={studentLearningFontSizeMax}
            min={studentLearningFontSizeMin}
            name="studentLearningFontSize"
            onChange={(event) => setFontSize(event.target.value)}
            required
            step={1}
            type="number"
            value={fontSize}
          />
          <span className="mt-1.5 block text-xs font-semibold text-slate-500">请输入 {studentLearningFontSizeMin}–{studentLearningFontSizeMax} 之间的整数。</span>
        </label>
      </div>

      <div className="mt-5 rounded border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-bold text-slate-500">即时预览</p>
        <div
          className="mt-3 rounded border border-slate-200 bg-white p-4 text-slate-800"
          style={{ fontFamily: getStudentLearningFontFamilyCss(fontFamily), fontSize: `${getStudentLearningFontSizePixels(fontSize)}px` }}
        >
          <p className="font-bold">江苏 · 三年制 · 计算机专业</p>
          <p className="mt-2">每天学习一点点，持续练习，逐步掌握新的知识。</p>
        </div>
      </div>
    </form>
  );
}
