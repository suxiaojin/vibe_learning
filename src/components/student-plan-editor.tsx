"use client";

import { useState } from "react";
import { updateStudentPlan } from "@/app/admin/students/major-actions";

type PlanRegion = {
  id: string;
  province: string;
  studySystem: string;
  name: string;
  publicSubjects: Array<{ id: string; name: string }>;
  majors: Array<{ id: string; name: string }>;
};

type InitialProfile = { id: string; regionId: string | null; publicSubjectId: string | null; majorId: string | null } | null;

export function StudentPlanEditor({ studentId, username, returnTo, initialProfile, regions }: {
  studentId: string;
  username: string;
  returnTo: string;
  initialProfile: InitialProfile;
  regions: PlanRegion[];
}) {
  const initialRegion = regions.find((region) => region.id === initialProfile?.regionId);
  const [province, setProvince] = useState(initialRegion?.province || "");
  const [regionId, setRegionId] = useState(initialRegion?.id || "");
  const [subjectId, setSubjectId] = useState(initialProfile?.publicSubjectId || "");
  const [majorId, setMajorId] = useState(initialProfile?.majorId || "");
  const region = regions.find((item) => item.id === regionId);
  const subjectValid = Boolean(region?.publicSubjects.some((item) => item.id === subjectId));
  const majorValid = Boolean(region?.majors.some((item) => item.id === majorId));
  const provinces = Array.from(new Set(regions.map((item) => item.province)));
  const regionChoices = regions.filter((item) => item.province === province);
  const changed = !initialProfile || regionId !== initialProfile.regionId || subjectId !== initialProfile.publicSubjectId || majorId !== initialProfile.majorId;

  return (
    <details className="relative mt-2">
      <summary className="cursor-pointer list-none text-xs font-semibold text-teal hover:underline [&::-webkit-details-marker]:hidden">修改学习方案</summary>
      <form action={updateStudentPlan} className="absolute left-0 z-20 mt-2 grid w-80 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl" onSubmit={(event) => {
        if (!window.confirm(`确定修改 ${username} 的学习方案吗？原学习记录会保留。`)) event.preventDefault();
      }}>
        <input type="hidden" name="studentId" value={studentId} />
        <input type="hidden" name="profileId" value={initialProfile?.id || ""} />
        <input type="hidden" name="previousRegionId" value={initialProfile?.regionId || ""} />
        <input type="hidden" name="previousSubjectId" value={initialProfile?.publicSubjectId || ""} />
        <input type="hidden" name="previousMajorId" value={initialProfile?.majorId || ""} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <p className="text-sm font-semibold text-ink">修改 {username} 的学习方案</p>
        <p className="text-xs leading-5 text-slate-500">调整地区后，请核对公共课和专业；原学习记录会保留。</p>
        <label className="block text-xs font-semibold text-slate-600">省份
          <select className="input mt-1" value={province} onChange={(event) => { setProvince(event.target.value); setRegionId(""); }} required>
            <option value="">请选择省份</option>
            {provinces.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className="block text-xs font-semibold text-slate-600">学制
          <select className="input mt-1" name="regionId" value={regionId} onChange={(event) => setRegionId(event.target.value)} required disabled={!province}>
            <option value="">请选择学制</option>
            {regionChoices.map((item) => <option key={item.id} value={item.id}>{item.studySystem}{regionChoices.filter((choice) => choice.studySystem === item.studySystem).length > 1 ? `（${item.name}）` : ""}</option>)}
          </select>
        </label>
        <label className="block text-xs font-semibold text-slate-600">公共课
          <select className="input mt-1" name="publicSubjectId" value={subjectValid ? subjectId : ""} onChange={(event) => setSubjectId(event.target.value)} required disabled={!region}>
            <option value="">{region?.publicSubjects.length === 0 ? "该地区暂无可选公共课" : "请选择公共课"}</option>
            {region?.publicSubjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="block text-xs font-semibold text-slate-600">专业
          <select className="input mt-1" name="majorId" value={majorValid ? majorId : ""} onChange={(event) => setMajorId(event.target.value)} required disabled={!region}>
            <option value="">{region?.majors.length === 0 ? "该地区暂无可选专业" : "请选择专业"}</option>
            {region?.majors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <button className="primary-button w-full py-2 text-xs" type="submit" disabled={!region || !subjectValid || !majorValid || !changed}>确认修改</button>
      </form>
    </details>
  );
}
