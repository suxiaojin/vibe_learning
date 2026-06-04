"use client";

import { useMemo, useState } from "react";
import type { DashboardPeriod, DashboardRegionOption } from "@/lib/admin-dashboard";

const periodLabels: Record<DashboardPeriod, string> = {
  today: "今天",
  "7d": "近7天",
  "30d": "近30天"
};

function unique(values: string[]) {
  return [...new Set(values)];
}

function HiddenParams({ params }: { params: Record<string, string> }) {
  return Object.entries(params).map(([name, value]) => <input key={name} name={name} type="hidden" value={value} />);
}

function RegionSelects({
  regions,
  provinceName,
  studySystemName,
  defaultProvince,
  defaultStudySystem
}: {
  regions: DashboardRegionOption[];
  provinceName: string;
  studySystemName: string;
  defaultProvince: string;
  defaultStudySystem: string;
}) {
  const provinces = useMemo(() => unique(regions.map((region) => region.province)), [regions]);
  const [province, setProvince] = useState(defaultProvince);
  const [studySystem, setStudySystem] = useState(defaultStudySystem);
  const studySystems = useMemo(
    () => unique(regions.filter((region) => region.province === province).map((region) => region.studySystem)),
    [province, regions]
  );

  function changeProvince(nextProvince: string) {
    const nextStudySystems = unique(regions.filter((region) => region.province === nextProvince).map((region) => region.studySystem));
    setProvince(nextProvince);
    setStudySystem(nextStudySystems[0] || "");
  }

  return (
    <>
      <select
        className="h-9 border border-slate-300 bg-white px-3 text-xs font-semibold outline-none focus:border-[#0872b9]"
        name={provinceName}
        value={province}
        onChange={(event) => changeProvince(event.target.value)}
      >
        {provinces.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
      <select
        className="h-9 border border-slate-300 bg-white px-3 text-xs font-semibold outline-none focus:border-[#0872b9]"
        name={studySystemName}
        value={studySystem}
        onChange={(event) => setStudySystem(event.target.value)}
      >
        {studySystems.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
    </>
  );
}

export function DashboardMajorFilters({
  regions,
  defaultProvince,
  defaultStudySystem,
  preservedParams
}: {
  regions: DashboardRegionOption[];
  defaultProvince: string;
  defaultStudySystem: string;
  preservedParams: Record<string, string>;
}) {
  return (
    <form className="flex flex-wrap items-center gap-2" action="/admin/dashboard">
      <HiddenParams params={preservedParams} />
      <RegionSelects
        regions={regions}
        provinceName="majorProvince"
        studySystemName="majorStudySystem"
        defaultProvince={defaultProvince}
        defaultStudySystem={defaultStudySystem}
      />
      <button className="h-9 bg-[#0872b9] px-3 text-xs font-bold text-white transition hover:bg-[#0767a8]" type="submit">筛选</button>
    </form>
  );
}

export function DashboardRankingFilters({
  regions,
  defaultProvince,
  defaultStudySystem,
  defaultCourseType,
  defaultPeriod,
  preservedParams
}: {
  regions: DashboardRegionOption[];
  defaultProvince: string;
  defaultStudySystem: string;
  defaultCourseType: "public_subject" | "major";
  defaultPeriod: DashboardPeriod;
  preservedParams: Record<string, string>;
}) {
  return (
    <form className="flex flex-wrap items-center gap-2" action="/admin/dashboard">
      <HiddenParams params={preservedParams} />
      <RegionSelects
        regions={regions}
        provinceName="rankingProvince"
        studySystemName="rankingStudySystem"
        defaultProvince={defaultProvince}
        defaultStudySystem={defaultStudySystem}
      />
      <select className="h-9 border border-slate-300 bg-white px-3 text-xs font-semibold outline-none focus:border-[#0872b9]" name="rankingCourseType" defaultValue={defaultCourseType}>
        <option value="public_subject">公共课</option>
        <option value="major">专业课</option>
      </select>
      <select className="h-9 border border-slate-300 bg-white px-3 text-xs font-semibold outline-none focus:border-[#0872b9]" name="rankingPeriod" defaultValue={defaultPeriod}>
        {Object.entries(periodLabels).map(([period, label]) => <option key={period} value={period}>{label}</option>)}
      </select>
      <button className="h-9 bg-[#0872b9] px-4 text-xs font-bold text-white transition hover:bg-[#0767a8]" type="submit">筛选</button>
    </form>
  );
}
