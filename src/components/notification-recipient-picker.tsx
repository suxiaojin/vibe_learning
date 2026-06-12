"use client";

import { CheckCheck, Search, SlidersHorizontal, X } from "lucide-react";
import { useMemo, useState } from "react";

export type NotificationRecipientOption = {
  email?: string;
  id: string;
  majorName: string;
  province: string;
  studySystem: string;
  username: string;
};

type RecipientFilters = {
  keyword: string;
  majorName: string;
  province: string;
  studySystem: string;
};

const emptyFilters: RecipientFilters = {
  keyword: "",
  majorName: "",
  province: "",
  studySystem: ""
};

export function NotificationRecipientPicker({
  showEmail = false,
  students
}: {
  showEmail?: boolean;
  students: NotificationRecipientOption[];
}) {
  const [draftFilters, setDraftFilters] = useState<RecipientFilters>(emptyFilters);
  const [filters, setFilters] = useState<RecipientFilters>(emptyFilters);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const provinces = useMemo(() => distinct(students.map((student) => student.province)), [students]);
  const studySystems = useMemo(() => distinct(students.map((student) => student.studySystem)), [students]);
  const majors = useMemo(() => distinct(students.map((student) => student.majorName)), [students]);
  const filteredStudents = useMemo(() => {
    const keyword = filters.keyword.trim().toLowerCase();
    return students.filter((student) =>
      (!keyword || student.username.toLowerCase().includes(keyword) || student.email?.toLowerCase().includes(keyword))
      && (!filters.province || student.province === filters.province)
      && (!filters.studySystem || student.studySystem === filters.studySystem)
      && (!filters.majorName || student.majorName === filters.majorName)
    );
  }, [filters, students]);
  const allFilteredSelected = filteredStudents.length > 0 && filteredStudents.every((student) => selectedIds.has(student.id));

  function updateDraftFilter(key: keyof RecipientFilters, value: string) {
    setDraftFilters((current) => ({ ...current, [key]: value }));
  }

  function applyFilters() {
    setFilters(draftFilters);
  }

  function resetFilters() {
    setDraftFilters(emptyFilters);
    setFilters(emptyFilters);
  }

  function toggleStudent(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleFilteredStudents() {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allFilteredSelected) {
        filteredStudents.forEach((student) => next.delete(student.id));
      } else {
        filteredStudents.forEach((student) => next.add(student.id));
      }
      return next;
    });
  }

  return (
    <div>
      {Array.from(selectedIds).map((id) => <input key={id} name="recipientIds" readOnly type="hidden" value={id} />)}

      <div className="border border-slate-200 bg-slate-50 p-4">
        <div className="grid gap-3 xl:grid-cols-[minmax(220px,1.2fr)_repeat(3,minmax(150px,0.8fr))_auto_auto] xl:items-end">
          <label>
            <span className="label">{showEmail ? "用户名 / 邮箱搜索" : "用户名搜索"}</span>
            <span className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
              <input
                className="input rounded-none pl-10"
                onChange={(event) => updateDraftFilter("keyword", event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    applyFilters();
                  }
                }}
                placeholder={showEmail ? "输入用户名或邮箱" : "输入用户名"}
                value={draftFilters.keyword}
              />
            </span>
          </label>
          <FilterSelect label="省份" onChange={(value) => updateDraftFilter("province", value)} options={provinces} value={draftFilters.province} />
          <FilterSelect label="学制" onChange={(value) => updateDraftFilter("studySystem", value)} options={studySystems} value={draftFilters.studySystem} />
          <FilterSelect label="专业名称" onChange={(value) => updateDraftFilter("majorName", value)} options={majors} value={draftFilters.majorName} />
          <button className="primary-button rounded-none px-4" onClick={applyFilters} type="button">
            <SlidersHorizontal size={16} />
            确定筛选
          </button>
          <button className="secondary-button rounded-none px-4" onClick={resetFilters} type="button">
            重置
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-600">
          共 {students.length} 名学生，当前显示 {filteredStudents.length} 名，已选择 <span className="font-black text-teal">{selectedIds.size}</span> 名
        </p>
        <div className="flex gap-2">
          <button className="secondary-button rounded-none px-3 py-2 text-xs" disabled={filteredStudents.length === 0} onClick={toggleFilteredStudents} type="button">
            <CheckCheck size={15} />
            {allFilteredSelected ? "取消当前全选" : "全选当前结果"}
          </button>
          <button className="secondary-button rounded-none px-3 py-2 text-xs" disabled={selectedIds.size === 0} onClick={() => setSelectedIds(new Set())} type="button">
            <X size={15} />
            清除选择
          </button>
        </div>
      </div>

      <div className="mt-3 max-h-[420px] overflow-auto border border-slate-200">
        <table className={showEmail ? "w-full min-w-[940px] border-collapse text-left text-sm" : "w-full min-w-[760px] border-collapse text-left text-sm"}>
          <thead className="sticky top-0 z-10 bg-[#f5fafc] text-slate-600">
            <tr>
              <th className="w-14 border-b border-slate-200 px-4 py-3">
                <input
                  aria-label="全选当前筛选结果"
                  checked={allFilteredSelected}
                  className="size-4 accent-teal"
                  onChange={toggleFilteredStudents}
                  type="checkbox"
                />
              </th>
              <th className="border-b border-slate-200 px-4 py-3 font-semibold">用户名</th>
              {showEmail ? <th className="border-b border-slate-200 px-4 py-3 font-semibold">邮箱</th> : null}
              <th className="border-b border-slate-200 px-4 py-3 font-semibold">省份</th>
              <th className="border-b border-slate-200 px-4 py-3 font-semibold">学制</th>
              <th className="border-b border-slate-200 px-4 py-3 font-semibold">专业名称</th>
            </tr>
          </thead>
          <tbody>
            {filteredStudents.length === 0 ? (
              <tr>
                <td className="px-4 py-12 text-center font-semibold text-slate-500" colSpan={showEmail ? 6 : 5}>没有符合筛选条件的学生。</td>
              </tr>
            ) : filteredStudents.map((student) => (
              <tr key={student.id} className="text-slate-700 hover:bg-sky-50/60">
                <td className="border-b border-slate-100 px-4 py-3">
                  <input
                    aria-label={`选择学生 ${student.username}`}
                    checked={selectedIds.has(student.id)}
                    className="size-4 accent-teal"
                    onChange={() => toggleStudent(student.id)}
                    type="checkbox"
                  />
                </td>
                <td className="border-b border-slate-100 px-4 py-3 font-bold text-ink">{student.username}</td>
                {showEmail ? <td className="border-b border-slate-100 px-4 py-3">{student.email || "未设置"}</td> : null}
                <td className="border-b border-slate-100 px-4 py-3">{student.province || "未设置"}</td>
                <td className="border-b border-slate-100 px-4 py-3">{student.studySystem || "未设置"}</td>
                <td className="border-b border-slate-100 px-4 py-3">{student.majorName || "未设置"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  onChange,
  options,
  value
}: {
  label: string;
  onChange: (value: string) => void;
  options: string[];
  value: string;
}) {
  return (
    <label>
      <span className="label">{label}</span>
      <select className="input rounded-none" onChange={(event) => onChange(event.target.value)} value={value}>
        <option value="">全部{label}</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function distinct(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, "zh-CN"));
}
