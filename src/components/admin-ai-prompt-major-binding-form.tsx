"use client";

import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { bindMajorAiExplainPrompt } from "@/app/admin/settings/prompt-actions";

type RegionMajorOption = {
  id: string;
  regionId: string;
  regionName: string;
  majorId: string;
  majorName: string;
  currentProfileName: string | null;
};

export function AdminAiPromptMajorBindingForm({
  profileId,
  regionMajors
}: {
  profileId: string;
  regionMajors: RegionMajorOption[];
}) {
  const [regionId, setRegionId] = useState("");
  const [majorId, setMajorId] = useState("");
  const regions = useMemo(() => {
    const seen = new Set<string>();
    return regionMajors.flatMap((item) => {
      if (seen.has(item.regionId)) {
        return [];
      }
      seen.add(item.regionId);
      return [{ id: item.regionId, name: item.regionName }];
    });
  }, [regionMajors]);
  const majors = useMemo(
    () => regionMajors.filter((item) => item.regionId === regionId),
    [regionId, regionMajors]
  );

  return (
    <form action={bindMajorAiExplainPrompt} className="mt-3 grid gap-3">
      <input name="profileId" type="hidden" value={profileId} />
      <label className="grid gap-1.5 text-xs font-black text-slate-600">
        区域学制
        <select
          className="input rounded-none text-sm"
          name="regionId"
          onChange={(event) => {
            setRegionId(event.target.value);
            setMajorId("");
          }}
          required
          value={regionId}
        >
          <option value="">选择区域学制</option>
          {regions.map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}
        </select>
      </label>

      <label className="grid gap-1.5 text-xs font-black text-slate-600">
        专业课程
        <select
          className="input rounded-none text-sm disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
          disabled={!regionId}
          name="majorId"
          onChange={(event) => setMajorId(event.target.value)}
          required
          value={majorId}
        >
          <option value="">{regionId ? "选择专业课程" : "请先选择区域学制"}</option>
          {majors.map((item) => (
            <option key={item.id} value={item.majorId}>
              {item.majorName}{item.currentProfileName ? `（当前：${item.currentProfileName}）` : "（使用兜底）"}
            </option>
          ))}
        </select>
      </label>

      <button
        className="secondary-button justify-center rounded-none border-violet-200 text-violet-700 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!regionId || !majorId}
        type="submit"
      >
        <Plus size={15} />绑定课程
      </button>
    </form>
  );
}
