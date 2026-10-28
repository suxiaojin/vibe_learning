"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { SurfaceCard } from "@/components/student-ui";
import { getFeedFilterOptions, type FeedFilterMajor, type FeedFilterRegion } from "@/lib/buddy-feed-filter-options";

export function BuddyFeedFilters({ majors, params, regions, scope, sort }: {
  majors: FeedFilterMajor[];
  params?: { province?: string; studySystem?: string; majorId?: string };
  regions: FeedFilterRegion[];
  scope: "discover" | "following";
  sort: "latest" | "hot";
}) {
  const [province, setProvince] = useState(params?.province || "");
  const [studySystem, setStudySystem] = useState(params?.studySystem || "");
  const [majorId, setMajorId] = useState(params?.majorId || "");
  const options = getFeedFilterOptions(regions, majors, province, studySystem);

  function changeProvince(nextProvince: string) {
    const nextStudySystems = getFeedFilterOptions(regions, majors, nextProvince, "").studySystems;
    const nextStudySystem = nextStudySystems.includes(studySystem) ? studySystem : "";
    const nextMajors = getFeedFilterOptions(regions, majors, nextProvince, nextStudySystem).majors;
    setProvince(nextProvince);
    setStudySystem(nextStudySystem);
    if (!nextMajors.some((major) => major.id === majorId)) setMajorId("");
  }

  function changeStudySystem(nextStudySystem: string) {
    const nextMajors = getFeedFilterOptions(regions, majors, province, nextStudySystem).majors;
    setStudySystem(nextStudySystem);
    if (!nextMajors.some((major) => major.id === majorId)) setMajorId("");
  }

  function saveFilters(values: { province: string; studySystem: string; majorId: string }) {
    const attributes = "Path=/buddy-circle; Max-Age=31536000; SameSite=Lax";
    document.cookie = `buddyFeedProvince=${encodeURIComponent(values.province)}; ${attributes}`;
    document.cookie = `buddyFeedStudySystem=${encodeURIComponent(values.studySystem)}; ${attributes}`;
    document.cookie = `buddyFeedMajorId=${encodeURIComponent(values.majorId)}; ${attributes}`;
  }

  return (
    <SurfaceCard className="border-border-soft/70 bg-surface/80 p-4 shadow-none">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-ink"><SlidersHorizontal className="text-slate-400" size={18} />筛选条件</div>
      <form className="space-y-3" method="get" onSubmit={() => saveFilters({ province, studySystem, majorId })}>
        <input name="tab" type="hidden" value={scope} />
        <input name="sort" type="hidden" value={sort} />
        <label className="block"><span className="label">省份</span>
          <select className="input min-h-11 rounded-xl text-sm" name="province" value={province} onChange={(event) => changeProvince(event.target.value)}>
            <option value="">全部省份</option>{options.provinces.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className="block"><span className="label">学制</span>
          <select className="input min-h-11 rounded-xl text-sm" name="studySystem" value={studySystem} onChange={(event) => changeStudySystem(event.target.value)}>
            <option value="">全部学制</option>{options.studySystems.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className="block"><span className="label">专业</span>
          <select className="input min-h-11 rounded-xl text-sm" name="majorId" value={majorId} onChange={(event) => setMajorId(event.target.value)}>
            <option value="">全部专业</option>{options.majors.map((major) => <option key={major.id} value={major.id}>{major.name}</option>)}
          </select>
        </label>
        <div className="flex gap-2 pt-1"><button className="primary-button min-h-11 flex-1 rounded-xl text-sm" type="submit">筛选</button><a className="secondary-button min-h-11 rounded-xl px-4 text-sm" href={`/buddy-circle?tab=${scope}&province=&studySystem=&majorId=`} onClick={() => saveFilters({ province: "", studySystem: "", majorId: "" })}>重置</a></div>
      </form>
    </SurfaceCard>
  );
}
