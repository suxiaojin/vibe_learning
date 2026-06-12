"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock3,
  Loader2,
  MapPin,
  Monitor,
  Save,
  Settings2,
  Sigma,
  Target,
  X
} from "lucide-react";
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
  type: "success" | "error";
  message: string;
} | null;

export type CourseCenterOverview = {
  courses: Array<{
    key: "public_subject" | "major";
    title: string;
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
  redirecting: "马上跳转学习页面....",
  cancelRedirect: "取消跳转",
  cancel: "取消",
  save: "保存学习方案",
  saving: "保存中",
  loading: "加载课程中",
  saved: "学习方案已保存",
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
  const [redirectSeconds, setRedirectSeconds] = useState<number | null>(null);
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
    setRedirectSeconds(null);
  }

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
      setFeedback({ type: "success", message: text.saved });
      setRedirectSeconds(5);
      router.refresh();
    } catch {
      setFeedback({ type: "error", message: text.saveFailed });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-ink lg:text-4xl">课程中心</h1>
          <p className="mt-2 text-sm font-semibold text-slate-500 lg:text-base">选择课程，按自己的节奏开始学习</p>
        </div>
        <button
          className="secondary-button border-sky-300 px-5 text-sky-600 hover:border-sky-500 hover:text-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
          type="button"
          onClick={() => setDrawerOpen(true)}
        >
          <Settings2 size={19} />
          调整学习方案
        </button>
      </header>

      <section className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
        <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2">
          <span className="flex items-center gap-2 text-base font-black text-ink lg:text-lg">
            <MapPin className="text-sky-500" size={22} />
            {displayProfile?.regionName || `${displayProfile?.province || "尚未选择"}专转本`} · {displayProfile?.studySystem || "待设置"}
          </span>
          <span className="text-sm font-semibold text-slate-500">
            当前课程：<strong className="font-black text-slate-700">{displayProfile?.publicSubjectName || "未选择"} + {displayProfile?.majorName || "未选择"}</strong>
          </span>
        </div>
        <span className="flex items-center gap-2 text-sm font-bold text-teal">
          <CheckCircle2 size={18} />
          {displayProfile ? "已保存" : "待设置"}
        </span>
      </section>

      {overview.courses.length > 0 ? (
        <section className="mt-5 grid gap-5 xl:grid-cols-2">
          {overview.courses.map((course) => (
            <CourseCard key={course.key} course={course} />
          ))}
        </section>
      ) : (
        <section className="mt-5 rounded-2xl border border-dashed border-sky-300 bg-white px-6 py-12 text-center shadow-sm">
          <BookOpenCheck className="mx-auto text-sky-500" size={34} />
          <h2 className="mt-4 text-xl font-black text-ink">先完成学习方案设置</h2>
          <p className="mt-2 text-sm font-semibold text-slate-500">保存地区、公共课和专业课后，这里会展示你的课程与真实学习进度。</p>
          <button className="primary-button mt-5 px-6" type="button" onClick={() => setDrawerOpen(true)}>
            设置学习方案
          </button>
        </section>
      )}

      <LearningPlan overview={overview} />

      {drawerOpen ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/45" role="presentation" onMouseDown={closeDrawer}>
          <section
            aria-labelledby="course-plan-title"
            aria-modal="true"
            className="flex h-full w-full max-w-xl flex-col bg-mist shadow-2xl"
            role="dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-6 py-5">
              <div>
                <h2 className="text-2xl font-black text-ink" id="course-plan-title">调整学习方案</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">课程调整后，已完成的学习记录不会被清除。</p>
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
                <fieldset className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <legend className="px-2 text-sm font-black text-slate-500">{text.regionTitle}</legend>
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

                <fieldset className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <legend className="px-2 text-sm font-black text-slate-500">{text.courseTitle}</legend>
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

                <div className="rounded-2xl border border-sky-200 bg-sky-50 px-5 py-4">
                  <p className="text-xs font-black uppercase tracking-wider text-sky-600">调整后的学习方案</p>
                  <p className="mt-2 font-black text-ink">{selectedRegion?.name || selectedRegion?.province || "待选择"} · {selectedRegion?.studySystem || "待选择"}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-600">{selectedPublicSubject?.name || "待选择公共课"} + {selectedMajor?.name || "待选择专业课"}</p>
                </div>

                {feedback ? (
                  <div
                    className={cn(
                      "flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold",
                      feedback.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                    )}
                    role="status"
                  >
                    {feedback.type === "success" ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                    {feedback.message}
                  </div>
                ) : null}

                {loadingOptions ? (
                  <p className="flex items-center gap-2 text-sm font-bold text-slate-500">
                    <Loader2 className="animate-spin text-sky-500" size={18} />
                    {text.loading}
                  </p>
                ) : null}
              </div>
            </div>

            <footer className="border-t border-slate-200 bg-white px-6 py-5">
              {redirectSeconds !== null ? (
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-sky-50 px-4 py-3 text-sm font-black text-slate-600">
                  <span className="flex items-center gap-2">
                    <Loader2 className="animate-spin text-sky-500" size={18} />
                    {text.redirecting} <span className="text-sky-600">{redirectSeconds} 秒</span>
                  </span>
                  <button className="font-black text-sky-600 hover:text-sky-700" type="button" onClick={() => setRedirectSeconds(null)}>
                    {text.cancelRedirect}
                  </button>
                </div>
              ) : null}
              <div className="flex justify-end gap-3">
                <button className="secondary-button min-w-24" type="button" onClick={closeDrawer}>{text.cancel}</button>
                <button className="primary-button min-w-40" type="button" disabled={!canSave} onClick={saveSelection}>
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
    <article className={cn("rounded-2xl border bg-white p-6 shadow-sm", isMajor ? "border-teal/45" : "border-slate-200")}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <span className={cn("grid size-16 shrink-0 place-items-center rounded-2xl border", isMajor ? "border-teal/25 bg-teal/10 text-teal" : "border-sky-200 bg-sky-50 text-sky-600")}>
            {isMajor ? <Monitor size={32} /> : <Sigma size={32} />}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-2xl font-black text-ink">{course.title}</h2>
              <span className={cn("badge", isMajor ? "bg-teal/10 text-teal" : "bg-sky-50 text-sky-600")}>
                {isMajor ? "专业课" : "公共课"}
              </span>
            </div>
            <p className="mt-1 text-sm font-semibold text-slate-500">{course.chapterCount} 章 · {course.sectionCount} 个知识点</p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className={cn("text-3xl font-black", isMajor ? "text-teal" : "text-sky-600")}>{course.progressPercent}<span className="ml-0.5 text-base">%</span></p>
          <p className="mt-1 text-xs font-bold text-slate-400">学习进度</p>
        </div>
      </div>

      <div className="mt-6 h-2 overflow-hidden rounded-full bg-slate-100" aria-label={`${course.title}学习进度 ${course.progressPercent}%`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={course.progressPercent}>
        <div className={cn("h-full rounded-full", isMajor ? "bg-teal" : "bg-sky-500")} style={{ width: `${course.progressPercent}%` }} />
      </div>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-4 border-b border-slate-100 pb-5">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-bold text-slate-400"><Clock3 size={17} />当前学习</p>
          <p className="mt-2 truncate text-base font-black text-ink">{course.currentSection?.title || "课程内容准备中"}</p>
          {course.currentSection?.chapterTitle ? <p className="mt-1 truncate text-xs font-semibold text-slate-400">{course.currentSection.chapterTitle}</p> : null}
        </div>
        <Link className={cn(isMajor ? "primary-button" : "secondary-button border-sky-400 text-sky-600 hover:border-sky-500 hover:text-sky-700", "min-w-32 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300")} href={href}>
          {isMajor ? "继续学习" : "进入课程"}
          <ChevronRight size={17} />
        </Link>
      </div>

      <div className="pt-5">
        <p className="text-sm font-black text-slate-500">即将学习</p>
        {course.upcomingSections.length > 0 ? (
          <div className="mt-3 space-y-1">
            {course.upcomingSections.map((section) => {
              const content = (
                <>
                  <span className="flex min-w-0 items-center gap-3">
                    <Circle className={cn("shrink-0", isMajor ? "text-teal" : "text-sky-500")} size={11} />
                    <span className="truncate">{section.title}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-xs text-slate-400">
                    {section.status === "locked" ? "待解锁" : "可学习"}
                    <ChevronRight size={15} />
                  </span>
                </>
              );

              return section.status === "locked" ? (
                <div key={section.id} className="flex min-h-10 items-center justify-between gap-3 rounded-lg px-1 text-sm font-semibold text-slate-500">
                  {content}
                </div>
              ) : (
                <Link key={section.id} className="flex min-h-10 items-center justify-between gap-3 rounded-lg px-1 text-sm font-semibold text-slate-700 transition hover:text-teal" href={section.href}>
                  {content}
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="mt-3 text-sm font-semibold text-slate-400">{course.sectionCount === 0 ? "暂无已发布的课程内容" : "已完成当前课程的全部知识点"}</p>
        )}
        <Link className={cn("mt-4 inline-flex items-center gap-1 text-sm font-black", isMajor ? "text-teal" : "text-sky-600")} href={`/learn?course=${course.key}`}>
          查看全部 {course.sectionCount} 个知识点 <ChevronRight size={16} />
        </Link>
      </div>
    </article>
  );
}

function LearningPlan({ overview }: { overview: CourseCenterOverview }) {
  return (
    <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-ink">学习计划</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">根据本周真实学习记录自动更新</p>
        </div>
        <CalendarDays className="text-sky-500" size={24} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.05fr_.9fr_1.05fr] xl:divide-x xl:divide-slate-200">
        <div className="xl:pr-6">
          <p className="text-sm font-black text-slate-600">本周学习分布</p>
          <div className="mt-4 grid grid-cols-7 gap-2">
            {overview.week.days.map((day) => (
              <div key={day.key} className={cn("rounded-xl border px-2 py-3 text-center", day.isToday ? "border-sky-400 bg-sky-50" : "border-slate-200 bg-slate-50/70")}>
                <p className={cn("text-xs font-black", day.isToday ? "text-sky-600" : "text-slate-500")}>{day.label}</p>
                <span className={cn("mx-auto mt-3 grid size-7 place-items-center rounded-full text-xs font-black", day.count > 0 ? "bg-teal text-white" : "bg-slate-200 text-slate-400")}>
                  {day.count > 0 ? day.count : "-"}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm font-semibold text-slate-500">本周已有 {overview.week.activeDays} 天完成学习，保持稳定节奏效果更好。</p>
        </div>

        <div className="xl:px-6">
          <p className="text-sm font-black text-slate-600">本周完成</p>
          <div className="mt-4 flex items-center gap-4">
            <span className="grid size-20 shrink-0 place-items-center rounded-full border-[8px] border-teal/20 text-2xl font-black text-teal">{overview.week.completedCount}</span>
            <div>
              <p className="text-lg font-black text-ink">个知识点</p>
              <p className="mt-1 text-xs font-semibold leading-5 text-slate-400">持续积累，学习进度会同步更新</p>
            </div>
          </div>
          <Link className="mt-5 inline-flex items-center gap-1 text-sm font-black text-sky-600 hover:text-sky-700" href="/learn">
            查看学习地图 <ChevronRight size={16} />
          </Link>
        </div>

        <div className="xl:pl-6">
          <p className="text-sm font-black text-slate-600">最近学习动态</p>
          {overview.recentActivities.length > 0 ? (
            <div className="mt-3 divide-y divide-slate-100">
              {overview.recentActivities.map((activity) => (
                <div key={activity.id} className="flex items-center justify-between gap-4 py-3 first:pt-0">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-50 text-teal"><CheckCircle2 size={18} /></span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-ink">完成了 {activity.title}</p>
                      <p className="mt-0.5 truncate text-xs font-semibold text-slate-400">{activity.courseTitle}</p>
                    </div>
                  </div>
                  <time className="shrink-0 text-xs font-semibold text-slate-400" dateTime={activity.completedAt}>{formatActivityTime(activity.completedAt)}</time>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 flex items-start gap-3 rounded-xl bg-slate-50 px-4 py-4">
              <Target className="shrink-0 text-sky-500" size={20} />
              <p className="text-sm font-semibold leading-6 text-slate-500">完成第一个知识点后，这里会展示你的最近学习动态。</p>
            </div>
          )}
        </div>
      </div>
    </section>
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
      <span className="label font-bold">{label}</span>
      <select className="input min-h-12 cursor-pointer font-semibold disabled:cursor-not-allowed disabled:bg-slate-50" disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)}>
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

function formatActivityTime(value: string) {
  const date = new Date(value);
  const datePart = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "numeric",
    day: "numeric"
  }).format(date);
  const timePart = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);

  return `${datePart} ${timePart}`;
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}
