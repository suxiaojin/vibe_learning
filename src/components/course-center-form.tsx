"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Save, School, Sparkles } from "lucide-react";

type RegionOption = {
  id: string;
  name: string;
  province: string;
  studySystem: string;
  description: string | null;
};

type SubjectOption = {
  id: string;
  name: string;
  code?: string | null;
  description?: string | null;
};

type FoundationOptions = {
  regions: RegionOption[];
  selectedRegionId: string | null;
  publicSubjects: SubjectOption[];
  majors: SubjectOption[];
};

type CurrentProfile = {
  regionId: string | null;
  publicSubjectId: string | null;
  majorId: string | null;
  regionName: string;
  province: string;
  studySystem: string;
  publicSubjectName: string;
  majorName: string;
} | null;

type Feedback = {
  type: "success" | "error";
  message: string;
} | null;

const text = {
  regionTitle: "地区与学制",
  courseTitle: "课程选择",
  province: "省份",
  studySystem: "学制",
  publicSubject: "公共课",
  major: "专业课",
  current: "当前选择",
  notSelected: "未选择",
  redirecting: "马上跳转学习页面....",
  cancel: "取消",
  save: "保存选课",
  saving: "保存中",
  loading: "加载课程中",
  saved: "已保存选课",
  chooseAll: "请选择完整课程信息。",
  loadFailed: "课程选项加载失败，请稍后再试。",
  saveFailed: "保存失败，请稍后再试。",
  emptyRegions: "暂无可选地区。",
  emptyPublicSubjects: "暂无公共课。",
  emptyMajors: "暂无专业课。"
};

export function CourseCenterForm({
  initialOptions,
  currentProfile
}: {
  initialOptions: FoundationOptions;
  currentProfile: CurrentProfile;
}) {
  const router = useRouter();
  const initialRegionId = currentProfile?.regionId || initialOptions.selectedRegionId || initialOptions.regions[0]?.id || "";
  const initialRegion = initialOptions.regions.find((region) => region.id === initialRegionId) || initialOptions.regions[0] || null;
  const [options, setOptions] = useState(initialOptions);
  const [selectedProvince, setSelectedProvince] = useState(initialRegion?.province || "");
  const [selectedStudySystem, setSelectedStudySystem] = useState(initialRegion?.studySystem || "");
  const [selectedRegionId, setSelectedRegionId] = useState(initialRegion?.id || "");
  const [publicSubjectId, setPublicSubjectId] = useState(currentProfile?.publicSubjectId || initialOptions.publicSubjects[0]?.id || "");
  const [majorId, setMajorId] = useState(currentProfile?.majorId || initialOptions.majors[0]?.id || "");
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [savedProfile, setSavedProfile] = useState(currentProfile);
  const [redirectSeconds, setRedirectSeconds] = useState<number | null>(null);

  const provinces = useMemo(() => uniqueValues(options.regions.map((region) => region.province)), [options.regions]);
  const studySystems = useMemo(
    () => uniqueValues(options.regions.filter((region) => region.province === selectedProvince).map((region) => region.studySystem)),
    [options.regions, selectedProvince]
  );
  const selectedRegion = options.regions.find((region) => region.id === selectedRegionId) || null;
  const selectedPublicSubject = options.publicSubjects.find((subject) => subject.id === publicSubjectId) || null;
  const selectedMajor = options.majors.find((major) => major.id === majorId) || null;
  const canSave = Boolean(selectedRegionId && publicSubjectId && majorId && !loadingOptions && !saving);

  useEffect(() => {
    if (redirectSeconds === null) {
      return;
    }

    if (redirectSeconds <= 0) {
      router.push("/learn");
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setRedirectSeconds((current) => (current === null ? null : current - 1));
    }, 1000);

    return () => window.clearTimeout(timeoutId);
  }, [redirectSeconds, router]);

  useEffect(() => {
    if (!selectedRegionId) {
      return;
    }

    let cancelled = false;
    async function loadRegionOptions() {
      setLoadingOptions(true);
      try {
        const response = await fetch(`/api/foundation/options?regionId=${encodeURIComponent(selectedRegionId)}`);
        const payload = await response.json();

        if (!response.ok || !payload.ok) {
          throw new Error(payload.error?.message || text.loadFailed);
        }

        if (cancelled) {
          return;
        }

        const nextOptions = payload.data as FoundationOptions;
        setOptions(nextOptions);
        setPublicSubjectId((current) =>
          nextOptions.publicSubjects.some((subject) => subject.id === current) ? current : nextOptions.publicSubjects[0]?.id || ""
        );
        setMajorId((current) => (nextOptions.majors.some((major) => major.id === current) ? current : nextOptions.majors[0]?.id || ""));
        setFeedback(null);
      } catch {
        if (!cancelled) {
          setFeedback({ type: "error", message: text.loadFailed });
        }
      } finally {
        if (!cancelled) {
          setLoadingOptions(false);
        }
      }
    }

    void loadRegionOptions();
    return () => {
      cancelled = true;
    };
  }, [selectedRegionId]);

  function updateProvince(province: string) {
    const nextRegion = options.regions.find((region) => region.province === province) || null;
    setRedirectSeconds(null);
    setSelectedProvince(province);
    setSelectedStudySystem(nextRegion?.studySystem || "");
    setSelectedRegionId(nextRegion?.id || "");
  }

  function updateStudySystem(studySystem: string) {
    const nextRegion =
      options.regions.find((region) => region.province === selectedProvince && region.studySystem === studySystem) || null;
    setRedirectSeconds(null);
    setSelectedStudySystem(studySystem);
    setSelectedRegionId(nextRegion?.id || "");
  }

  function updatePublicSubject(nextPublicSubjectId: string) {
    setRedirectSeconds(null);
    setPublicSubjectId(nextPublicSubjectId);
  }

  function updateMajor(nextMajorId: string) {
    setRedirectSeconds(null);
    setMajorId(nextMajorId);
  }

  async function saveSelection() {
    if (!canSave) {
      setFeedback({ type: "error", message: text.chooseAll });
      return;
    }

    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/student/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regionId: selectedRegionId, publicSubjectId, majorId })
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error?.message || text.saveFailed);
      }

      setSavedProfile({
        regionId: selectedRegionId,
        publicSubjectId,
        majorId,
        regionName: selectedRegion?.name || "",
        province: selectedRegion?.province || "",
        studySystem: selectedRegion?.studySystem || "",
        publicSubjectName: selectedPublicSubject?.name || "",
        majorName: selectedMajor?.name || ""
      });
      setFeedback(null);
      setRedirectSeconds(5);
      router.refresh();
    } catch {
      setFeedback({ type: "error", message: text.saveFailed });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-500">
            <School size={24} />
          </span>
          <div>
            <h2 className="text-xl font-black text-ink">选择课程</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">江苏专转本学习配置</p>
          </div>
        </div>

        <div className="mt-6 grid gap-8 lg:grid-cols-2">
          <fieldset className="min-w-0 border-t border-slate-200 pt-4">
            <legend className="pr-3 text-sm font-black text-slate-500">{text.regionTitle}</legend>
            <div className="space-y-4">
              <SelectField
                disabled={options.regions.length === 0 || loadingOptions}
                label={text.province}
                value={selectedProvince}
                emptyLabel={text.emptyRegions}
                options={provinces.map((province) => ({ id: province, name: province }))}
                onChange={updateProvince}
              />
              <SelectField
                disabled={studySystems.length === 0 || loadingOptions}
                label={text.studySystem}
                value={selectedStudySystem}
                emptyLabel={text.emptyRegions}
                options={studySystems.map((studySystem) => ({ id: studySystem, name: studySystem }))}
                onChange={updateStudySystem}
              />
            </div>
          </fieldset>

          <fieldset className="min-w-0 border-t border-slate-200 pt-4">
            <legend className="pr-3 text-sm font-black text-slate-500">{text.courseTitle}</legend>
            <div className="space-y-4">
              <SelectField
                disabled={options.publicSubjects.length === 0 || loadingOptions}
                label={text.publicSubject}
                value={publicSubjectId}
                emptyLabel={text.emptyPublicSubjects}
                options={options.publicSubjects.map((subject) => ({ id: subject.id, name: subject.name }))}
                onChange={updatePublicSubject}
              />
              <SelectField
                disabled={options.majors.length === 0 || loadingOptions}
                label={text.major}
                value={majorId}
                emptyLabel={text.emptyMajors}
                options={options.majors.map((major) => ({ id: major.id, name: major.name }))}
                onChange={updateMajor}
              />
            </div>
          </fieldset>
        </div>

        {feedback ? (
          <div
            className={`mt-5 flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold ${
              feedback.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
            }`}
          >
            {feedback.type === "success" ? <CheckCircle2 size={18} /> : <Sparkles size={18} />}
            {feedback.message}
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5">
          <div className="min-h-11 min-w-0 flex-1">
            {redirectSeconds !== null ? (
              <div className="flex flex-wrap items-center gap-3 text-sm font-black text-slate-600">
                <span className="flex items-center gap-2">
                  <Loader2 className="animate-spin text-sky-500" size={18} />
                  {text.redirecting}
                  <span className="text-sky-600">{redirectSeconds} 秒</span>
                </span>
                <button className="secondary-button min-h-10 px-3" type="button" onClick={() => setRedirectSeconds(null)}>
                  {text.cancel}
                </button>
              </div>
            ) : null}
          </div>
          <button className="primary-button min-w-36" type="button" disabled={!canSave} onClick={saveSelection}>
            {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
            {saving ? text.saving : text.save}
          </button>
        </div>
      </section>

      <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-black text-ink">{text.current}</h2>
        <div className="mt-5 divide-y divide-slate-200 border-y border-slate-200">
          <SummaryItem label={text.province} value={savedProfile?.province || selectedRegion?.province || text.notSelected} />
          <SummaryItem label={text.studySystem} value={savedProfile?.studySystem || selectedRegion?.studySystem || text.notSelected} />
          <SummaryItem label={text.publicSubject} value={savedProfile?.publicSubjectName || selectedPublicSubject?.name || text.notSelected} />
          <SummaryItem label={text.major} value={savedProfile?.majorName || selectedMajor?.name || text.notSelected} />
        </div>
      </aside>
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  emptyLabel,
  disabled,
  onChange
}: {
  label: string;
  value: string;
  options: Array<{ id: string; name: string }>;
  emptyLabel: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <select className="input min-h-12 cursor-pointer font-semibold" disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.length === 0 ? <option value="">{emptyLabel}</option> : null}
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-1 py-3">
      <p className="text-xs font-black text-slate-400">{label}</p>
      <p className="mt-1 break-words text-sm font-black text-ink">{value}</p>
    </div>
  );
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}
