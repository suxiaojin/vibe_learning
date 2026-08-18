"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookOpenCheck,
  ChevronRight,
  Circle,
  Clock3,
  Loader2,
  Monitor,
  Save,
  Settings2,
  Sigma,
  Target,
  X
} from "lucide-react";
import { EmptyState, PageHeader, ProgressBar, SurfaceCard } from "@/components/student-ui";
import { cn } from "@/lib/utils";

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
  type: "error";
  message: string;
} | null;

export type CourseCenterOverview = {
  courses: Array<{
    key: "public_subject" | "major";
    title: string;
    publishedCourseCount: number;
    chapterCount: number;
    sectionCount: number;
    passedCount: number;
    progressPercent: number;
    currentSection: {
      title: string;
      chapterTitle: string;
      href: string;
    } | null;
    upcomingSections: Array<{
      id: string;
      title: string;
      status: "locked" | "unlocked" | "passed";
      href: string;
    }>;
  }>;
  week: {
    days: Array<{
      key: string;
      label: string;
      count: number;
      isToday: boolean;
    }>;
    completedCount: number;
    activeDays: number;
  };
  recentActivities: Array<{
    id: string;
    title: string;
    courseTitle: string;
    completedAt: string;
  }>;
};

const text = {
  regionTitle: "地区与学制",
  courseTitle: "课程选择",
  province: "省份",
  studySystem: "学制",
  publicSubject: "公共课",
  major: "专业课",
  cancel: "取消",
  save: "保存学习方案",
  saving: "保存中",
  loading: "加载课程中",
  chooseAll: "请选择完整课程信息。",
  loadFailed: "课程选项加载失败，请稍后再试。",
  saveFailed: "保存失败，请稍后再试。",
  emptyRegions: "暂无可选地区。",
  emptyPublicSubjects: "暂无公共课。",
  emptyMajors: "暂无专业课。"
};

export function CourseCenterForm({
  initialOptions,
  currentProfile,
  overview
}: {
  initialOptions: FoundationOptions;
  currentProfile: CurrentProfile;
  overview: CourseCenterOverview;
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
  const [drawerOpen, setDrawerOpen] = useState(!currentProfile);

  const provinces = useMemo(() => uniqueValues(options.regions.map((region) => region.province)), [options.regions]);
  const studySystems = useMemo(
    () => uniqueValues(options.regions.filter((region) => region.province === selectedProvince).map((region) => region.studySystem)),
    [options.regions, selectedProvince]
  );
  const selectedRegion = options.regions.find((region) => region.id === selectedRegionId) || null;
  const selectedPublicSubject = options.publicSubjects.find((subject) => subject.id === publicSubjectId) || null;
  const selectedMajor = options.majors.find((major) => major.id === majorId) || null;
  const displayProfile = savedProfile || currentProfile;
  const savedPlanLabel = formatSavedPlanLabel(displayProfile);
  const canSave = Boolean(selectedRegionId && publicSubjectId && majorId && !loadingOptions && !saving);

  useEffect(() => {
    if (!drawerOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeDrawer();
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [drawerOpen]);

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

  function closeDrawer() {
    setDrawerOpen(false);
  }

  function updateProvince(province: string) {
    const nextRegion = options.regions.find((region) => region.province === province) || null;
    setSelectedProvince(province);
    setSelectedStudySystem(nextRegion?.studySystem || "");
    setSelectedRegionId(nextRegion?.id || "");
  }

  function updateStudySystem(studySystem: string) {
    const nextRegion =
      options.regions.find((region) => region.province === selectedProvince && region.studySystem === studySystem) || null;
    setSelectedStudySystem(studySystem);
    setSelectedRegionId(nextRegion?.id || "");
  }

  function updatePublicSubject(nextPublicSubjectId: string) {
    setPublicSubjectId(nextPublicSubjectId);
  }

  function updateMajor(nextMajorId: string) {
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
      setDrawerOpen(false);
      router.refresh();
    } catch {
      setFeedback({ type: "error", message: text.saveFailed });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="课程中心"
        description={savedPlanLabel || "请先保存学习方案"}
        actions={
          <button className="secondary-button border-teal/30 px-5 text-[15px] text-teal hover:border-teal/60" type="button" onClick={() => setDrawerOpen(true)}>
            <Settings2 size={19} />
            调整学习方案
          </button>
        }
      />

      {overview.courses.length > 0 ? (
        <section className="mt-6 grid gap-5 xl:grid-cols-2">
          {overview.courses.map((course) => (
            <CourseCard key={course.key} course={course} />
          ))}
        </section>
      ) : (
        <div className="mt-6">
          <EmptyState
            icon={<BookOpenCheck size={28} />}
            title="先完成学习方案设置"
            description="保存地区、公共课和专业课后，这里会展示你的课程与真实学习进度。"
            action={
              <button className="primary-button px-6 text-[15px]" type="button" onClick={() => setDrawerOpen(true)}>
                设置学习方案
              </button>
            }
          />
        </div>
      )}

      {drawerOpen ? (
        <div className="drawer-scrim" role="presentation" onMouseDown={closeDrawer}>
          <section
            aria-labelledby="course-plan-title"
            aria-modal="true"
            className="drawer-panel"
            role="dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-6 py-5">
              <div>
                <h2 className="text-2xl font-semibold text-ink" id="course-plan-title">调整学习方案</h2>
                <p className="mt-1 text-sm font-medium leading-6 text-slate-500">课程调整后，已完成的学习记录不会被清除。</p>
              </div>
              <button
                aria-label="关闭调整学习方案"
                className="icon-button shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/30"
                type="button"
                onClick={closeDrawer}
              >
                <X size={20} />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
              <div className="space-y-5">
                <fieldset className="surface-card p-5">
                  <legend className="px-2 text-sm font-semibold text-slate-600">{text.regionTitle}</legend>
                  <div className="mt-1 grid gap-4 sm:grid-cols-2">
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

                <fieldset className="surface-card p-5">
                  <legend className="px-2 text-sm font-semibold text-slate-600">{text.courseTitle}</legend>
                  <div className="mt-1 grid gap-4 sm:grid-cols-2">
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

                <div className="rounded-panel border border-teal/20 bg-teal/5 px-5 py-4">
                  <p className="text-xs font-semibold uppercase text-teal">调整后的学习方案</p>
                  <p className="mt-2 font-semibold text-ink">{selectedRegion?.name || selectedRegion?.province || "待选择"} · {selectedRegion?.studySystem || "待选择"}</p>
                  <p className="mt-1 text-sm font-medium text-slate-600">{selectedPublicSubject?.name || "待选择公共课"} + {selectedMajor?.name || "待选择专业课"}</p>
                </div>

                {feedback ? (
                  <div
                    className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
                    role="alert"
                  >
                    <Circle size={18} />
                    {feedback.message}
                  </div>
                ) : null}

                {loadingOptions ? (
                  <p className="flex items-center gap-2 text-sm font-semibold text-slate-500">
                    <Loader2 className="animate-spin text-teal" size={18} />
                    {text.loading}
                  </p>
                ) : null}
              </div>
            </div>

            <footer className="border-t border-slate-200 bg-white px-6 py-5">
              <div className="flex justify-end gap-3">
                <button className="secondary-button min-w-24 text-[15px]" type="button" onClick={closeDrawer}>{text.cancel}</button>
                <button className="primary-button min-w-40 text-[15px]" type="button" disabled={!canSave} onClick={saveSelection}>
                  {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                  {saving ? text.saving : text.save}
                </button>
              </div>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}

function CourseCard({ course }: { course: CourseCenterOverview["courses"][number] }) {
  const isMajor = course.key === "major";
  const href = course.currentSection?.href || `/learn?course=${course.key}`;

  return (
    <SurfaceCard
      as="article"
      className={cn(
        "flex flex-col p-6",
        isMajor ? "border-teal/35" : "border-info/15"
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <span className={cn("grid size-16 shrink-0 place-items-center rounded-2xl border", isMajor ? "border-teal/25 bg-teal/10 text-teal" : "border-info/15 bg-info-muted text-info")}>
            {isMajor ? <Monitor size={32} /> : <Sigma size={32} />}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-2xl font-semibold text-ink">{course.title}</h2>
              <span className={cn("badge", isMajor ? "bg-teal/10 text-teal" : "bg-info-muted text-info")}>
                {isMajor ? "专业课" : "公共课"}
              </span>
            </div>
            <p className="mt-1 text-sm font-medium text-slate-500">已发布-{course.publishedCourseCount}门课程-{course.chapterCount}章关卡</p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className={cn("text-[34px] font-bold leading-none", isMajor ? "text-teal" : "text-info")}>{course.progressPercent}<span className="ml-0.5 text-base">%</span></p>
          <p className="mt-1 text-xs font-semibold text-slate-400">学习进度</p>
        </div>
      </div>

      <div className="mt-6">
        <ProgressBar
          label={`${course.title}学习进度 ${course.progressPercent}%`}
          value={course.progressPercent}
          indicatorClassName={isMajor ? "bg-teal" : "bg-info"}
        />
      </div>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-4 border-b border-slate-100 pb-5">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium text-slate-400"><Clock3 size={17} />当前学习</p>
          <p className="mt-2 truncate text-base font-semibold text-ink">{course.currentSection?.title || "课程内容准备中"}</p>
          {course.currentSection?.chapterTitle ? <p className="mt-1 truncate text-xs font-medium text-slate-400">{course.currentSection.chapterTitle}</p> : null}
        </div>
        <Link className={cn(isMajor ? "primary-button" : "secondary-button border-info/25 text-info hover:border-info/50 hover:text-info", "min-w-32 text-[15px]")} href={href}>
          {isMajor ? "继续学习" : "进入课程"}
          <ChevronRight size={17} />
        </Link>
      </div>

      <div className="border-b border-slate-100 pb-5 pt-5">
        <p className="text-sm font-semibold text-slate-500">即将学习</p>
        {course.upcomingSections.length > 0 ? (
          <div className="mt-3 space-y-1">
            {course.upcomingSections.map((section) => {
              const content = (
                <>
                  <span className="flex min-w-0 items-center gap-3">
                    <Circle className={cn("shrink-0", isMajor ? "text-teal" : "text-info")} size={11} />
                    <span className="truncate">{section.title}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-xs text-slate-400">
                    {section.status === "locked" ? "待解锁" : "可学习"}
                    <ChevronRight size={15} />
                  </span>
                </>
              );

              return section.status === "locked" ? (
                <div key={section.id} className="flex min-h-10 items-center justify-between gap-3 rounded-lg px-1 text-sm font-medium text-slate-500">
                  {content}
                </div>
              ) : (
                <Link key={section.id} className="flex min-h-10 items-center justify-between gap-3 rounded-lg px-1 text-sm font-medium text-slate-700 transition hover:text-teal" href={section.href}>
                  {content}
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="mt-3 text-sm font-medium text-slate-400">{course.sectionCount === 0 ? "暂无已发布的课程内容" : "已完成当前课程的全部知识点"}</p>
        )}
        <Link className={cn("mt-4 inline-flex items-center gap-1 text-sm font-semibold", isMajor ? "text-teal" : "text-info")} href={`/course-center/knowledge-map?course=${course.key}`}>
          查看课程导图 <ChevronRight size={16} />
        </Link>
      </div>

      <div className="mt-auto grid gap-3 pt-5">
        <PracticeTestAction
          buttonLabel="开始练习"
          href={`/mock-tests/special?course=${course.key}`}
          isMajor={isMajor}
          title="专项练习"
        />
      </div>
    </SurfaceCard>
  );
}

function PracticeTestAction({
  title,
  buttonLabel,
  href,
  isMajor
}: {
  title: string;
  buttonLabel: string;
  href: string;
  isMajor: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-border-soft/80 bg-surface px-4 py-4 shadow-card">
      <div className="flex min-w-0 items-center gap-4">
        <span
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-full",
            isMajor ? "bg-teal/10 text-teal" : "bg-info-muted text-info"
          )}
        >
          <Target size={24} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold text-ink">{title}</p>
        </div>
      </div>
      <Link
        className={cn(
          "inline-flex min-h-12 shrink-0 items-center justify-center rounded-xl px-6 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2",
          isMajor
            ? "border border-teal/35 bg-white text-teal focus-visible:ring-teal/25"
            : "border border-info/25 bg-white text-info focus-visible:ring-info/20"
        )}
        href={href}
      >
        {buttonLabel}
      </Link>
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
      <span className="label font-semibold">{label}</span>
      <select className="input min-h-12 cursor-pointer text-[15px] font-medium disabled:cursor-not-allowed disabled:bg-slate-50" disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)}>
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

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function formatSavedPlanLabel(profile: CurrentProfile) {
  if (!profile) {
    return "";
  }

  const regionPart = [profile.province, profile.studySystem].filter(Boolean).join("");
  const coursePart = [profile.publicSubjectName, profile.majorName].filter(Boolean).join("+");

  if (regionPart && coursePart) {
    return `${regionPart}-${coursePart}`;
  }

  return regionPart || coursePart;
}
