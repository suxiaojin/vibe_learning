"use client";

import { useId, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from "lucide-react";
import { saveSocialFollowRecommendationSettings } from "@/app/admin/settings/social-recommendation-actions";

type Rule = { targetUserId: string; province: string; studySystem: string; majorId: string };
type Student = { id: string; username: string; nickname: string; status: string };
type Region = { province: string; studySystem: string };
type Major = { id: string; name: string };

function StudentSearchSelect({ students, targetUserId, unavailableIds, onSelect }: {
  students: Student[];
  targetUserId: string;
  unavailableIds: Set<string>;
  onSelect: (id: string) => void;
}) {
  const selected = students.find((student) => student.id === targetUserId);
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const keyword = query.trim().toLocaleLowerCase();
  const matches = open && keyword ? students.filter((student) => {
    if (unavailableIds.has(student.id) && student.id !== targetUserId) return false;
    return `${student.nickname} ${student.username}`.toLocaleLowerCase().includes(keyword);
  }).slice(0, 30) : [];

  function choose(student: Student) {
    onSelect(student.id);
    setQuery("");
    setOpen(false);
    setActiveIndex(0);
  }

  return (
    <div className="relative">
      <input
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={open && Boolean(query.trim())}
        className="input rounded-none text-sm"
        onChange={(event) => { setQuery(event.target.value); setOpen(true); setActiveIndex(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && matches.length) { event.preventDefault(); setOpen(true); setActiveIndex((index) => Math.min(index + 1, matches.length - 1)); }
          if (event.key === "ArrowUp" && matches.length) { event.preventDefault(); setActiveIndex((index) => Math.max(index - 1, 0)); }
          if (event.key === "Enter" && open && matches.length) { event.preventDefault(); choose(matches[activeIndex] ?? matches[0]); }
          if (event.key === "Escape") setOpen(false);
        }}
        onBlur={() => setOpen(false)}
        placeholder={selected ? `${selected.nickname} (@${selected.username})` : "输入昵称或用户名搜索"}
        role="combobox"
        value={open ? query : ""}
      />
      <input name="targetUserId" type="hidden" value={targetUserId} />
      {open && query.trim() && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto border border-slate-200 bg-white shadow-lg" id={listId} role="listbox">
          {matches.length ? matches.map((student, index) => (
            <button
              aria-selected={index === activeIndex}
              className={`block w-full px-3 py-2 text-left text-sm hover:bg-teal-50 ${index === activeIndex ? "bg-teal-50" : ""}`}
              key={student.id}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(student)}
              role="option"
              type="button"
            >
              {student.nickname}（@{student.username}{student.status === "active" ? "" : "，已停用"}）
            </button>
          )) : <p className="px-3 py-2 text-sm text-slate-500">{ "\u6682\u65e0\u5339\u914d\u7528\u6237" }</p>}
        </div>
      )}
    </div>
  );
}

export function AdminSocialFollowRecommendations({
  majors, regions, rules: initialRules, students
}: {
  majors: Major[]; regions: Region[]; rules: Rule[]; students: Student[];
}) {
  const [rules, setRules] = useState(initialRules);
  const provinces = Array.from(new Set(regions.map((region) => region.province))).sort((a, b) => a.localeCompare(b, "zh-CN"));
  const studySystems = Array.from(new Set(regions.map((region) => region.studySystem))).sort((a, b) => a.localeCompare(b, "zh-CN"));

  function updateRule(index: number, patch: Partial<Rule>) {
    setRules((current) => current.map((rule, rowIndex) => rowIndex === index ? { ...rule, ...patch } : rule));
  }
  function moveRule(index: number, offset: number) {
    const target = index + offset;
    if (target < 0 || target >= rules.length) return;
    setRules((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  return (
    <form action={saveSocialFollowRecommendationSettings} className="border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-lg font-black text-ink">推荐关注</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            可指定推荐用户，并按省份、学制、专业设置适用范围。留空表示不限；指定推荐优先显示，剩余位置由原有同条件推荐补足。
          </p>
        </div>
        <button className="primary-button rounded-none" type="submit"><Save size={16} />保存推荐设置</button>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold text-slate-500">按列表顺序优先推荐，最多配置 100 位；每位用户只能配置一条规则。</p>
        <button className="secondary-button rounded-none" disabled={rules.length >= 100}
          onClick={() => setRules((current) => [...current, { targetUserId: "", province: "", studySystem: "", majorId: "" }])}
          type="button"><Plus size={16} />添加用户</button>
      </div>
      {rules.length === 0 ? (
        <p className="mt-4 border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm font-semibold text-slate-500">
          尚未指定推荐用户，学生端继续使用原有自动推荐。
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {rules.map((rule, index) => {
            const selectedIds = new Set(rules.map((item) => item.targetUserId).filter(Boolean));
            return (
              <div className="grid gap-3 border border-slate-200 bg-slate-50 p-3 xl:grid-cols-[minmax(200px,1.2fr)_repeat(3,minmax(140px,1fr))_auto]" key={rule.targetUserId + "-" + index}>
                <label className="text-xs font-bold text-slate-600"><span className="mb-1 block">推荐用户</span>
                  <StudentSearchSelect students={students} targetUserId={rule.targetUserId} unavailableIds={selectedIds}
                    onSelect={(targetUserId) => updateRule(index, { targetUserId })} />
                </label>
                <label className="text-xs font-bold text-slate-600"><span className="mb-1 block">适用省份</span>
                  <select className="input rounded-none text-sm" name="province" value={rule.province}
                    onChange={(event) => updateRule(index, { province: event.target.value })}>
                    <option value="">全部省份</option>
                    {provinces.map((province) => <option key={province} value={province}>{province}</option>)}
                  </select>
                </label>
                <label className="text-xs font-bold text-slate-600"><span className="mb-1 block">适用学制</span>
                  <select className="input rounded-none text-sm" name="studySystem" value={rule.studySystem}
                    onChange={(event) => updateRule(index, { studySystem: event.target.value })}>
                    <option value="">全部学制</option>
                    {studySystems.map((system) => <option key={system} value={system}>{system}</option>)}
                  </select>
                </label>
                <label className="text-xs font-bold text-slate-600"><span className="mb-1 block">适用专业</span>
                  <select className="input rounded-none text-sm" name="majorId" value={rule.majorId}
                    onChange={(event) => updateRule(index, { majorId: event.target.value })}>
                    <option value="">全部专业</option>
                    {majors.map((major) => <option key={major.id} value={major.id}>{major.name}</option>)}
                  </select>
                </label>
                <div className="flex items-end justify-end gap-1">
                  <button aria-label={"上移第 " + (index + 1) + " 条推荐"} className="secondary-button size-9 justify-center p-0"
                    disabled={index === 0} onClick={() => moveRule(index, -1)} type="button"><ArrowUp size={15} /></button>
                  <button aria-label={"下移第 " + (index + 1) + " 条推荐"} className="secondary-button size-9 justify-center p-0"
                    disabled={index === rules.length - 1} onClick={() => moveRule(index, 1)} type="button"><ArrowDown size={15} /></button>
                  <button aria-label={"删除第 " + (index + 1) + " 条推荐"} className="secondary-button size-9 justify-center p-0 text-red-600"
                    onClick={() => setRules((current) => current.filter((_, rowIndex) => rowIndex !== index))}
                    type="button"><Trash2 size={15} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </form>
  );
}
