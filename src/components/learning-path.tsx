"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpenText, Check, ChevronDown, Lock, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type PathPoint = {
  id: string;
  title: string;
  questionCount: number;
  status: "locked" | "unlocked" | "passed";
};

export type PathCourse = {
  id: string;
  name: string;
  courseType: "public_subject" | "major";
};

type CourseSwitcherProps = {
  activeCourseId: string;
  courses: PathCourse[];
};

type LearningPathProps = {
  chapter: {
    id: string;
    title: string;
    sortOrder: number;
    passedCount: number;
    points: PathPoint[];
  };
};

const text = {
  back: "\u8fd4\u56de",
  guide: "\u6307\u5357",
  myCourses: "\u6211\u7684\u8bfe\u7a0b",
  part: "\u7b2c",
  section: "\u90e8\u5206",
  passed: "\u5df2\u901a\u8fc7",
  start: "\u5f00\u59cb",
  questions: "\u9898"
} as const;

export function LearningPath({ chapter }: LearningPathProps) {
  const firstActivePoint = useMemo(
    () => chapter.points.find((point) => point.status !== "locked") || chapter.points[0],
    [chapter.points]
  );
  const [activePointId, setActivePointId] = useState(firstActivePoint?.id || "");

  const activePoint = chapter.points.find((point) => point.id === activePointId) || firstActivePoint;

  useEffect(() => {
    setActivePointId(firstActivePoint?.id || "");
  }, [firstActivePoint?.id]);

  useEffect(() => {
    function updateActivePoint() {
      let nextId = activePointId;
      let bestDistance = Number.POSITIVE_INFINITY;

      for (const point of chapter.points) {
        const element = document.getElementById(`point-${point.id}`);
        if (!element) {
          continue;
        }
        const rect = element.getBoundingClientRect();
        const distance = Math.abs(rect.top - 260);
        if (rect.top < window.innerHeight * 0.75 && distance < bestDistance) {
          bestDistance = distance;
          nextId = point.id;
        }
      }

      if (nextId !== activePointId) {
        setActivePointId(nextId);
      }
    }

    updateActivePoint();
    window.addEventListener("scroll", updateActivePoint, { passive: true });
    return () => window.removeEventListener("scroll", updateActivePoint);
  }, [activePointId, chapter.points]);

  return (
    <div className="mx-auto max-w-2xl pb-24">
      <section className="sticky top-6 z-20">
        <div className="rounded-2xl bg-[#58cc02] p-4 text-white shadow-[0_8px_0_rgba(69,160,0,0.22)]">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <Link className="mb-1 inline-flex items-center gap-2 text-sm font-black text-white/80 hover:text-white" href="/learn/stages">
                <ArrowLeft size={18} />
                {text.part} {chapter.sortOrder} {text.section} / {chapter.title}
              </Link>
              <h1 className="truncate text-2xl font-black">{activePoint?.title || chapter.title}</h1>
            </div>
            {activePoint ? (
              <Link
                className="inline-flex min-h-14 shrink-0 items-center gap-2 rounded-2xl border-2 border-black/10 bg-white/10 px-4 text-sm font-black text-white shadow-[0_4px_0_rgba(0,0,0,0.16)] transition hover:-translate-y-0.5"
                href={`/learn/${activePoint.id}/guide`}
              >
                <BookOpenText size={22} />
                {text.guide}
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      <section className="mt-8">
        <div className="mb-8 flex items-center gap-4 text-slate-400">
          <div className="h-px flex-1 bg-slate-200" />
          <div className="text-center">
            <p className="text-xs font-black uppercase tracking-wide">{text.part} {chapter.sortOrder} {text.section}</p>
            <h2 className="mt-1 text-lg font-black text-slate-500">{chapter.title}</h2>
            <p className="mt-1 text-xs font-semibold">{chapter.passedCount}/{chapter.points.length} {text.passed}</p>
          </div>
          <div className="h-px flex-1 bg-slate-200" />
        </div>

        <div className="relative mx-auto flex max-w-md flex-col items-center gap-9">
          {chapter.points.map((point, index) => {
            const locked = point.status === "locked";
            const offset = index % 4 === 1 ? "-translate-x-12" : index % 4 === 2 ? "translate-x-12" : "";
            return (
              <div id={`point-${point.id}`} key={point.id} className={cn("relative flex w-full scroll-mt-48 justify-center", offset)}>
                {index < chapter.points.length - 1 ? <div className="absolute left-1/2 top-20 h-12 w-1 -translate-x-1/2 rounded-full bg-slate-200" /> : null}
                <Link
                  href={locked ? "/learn" : `/learn/${point.id}`}
                  className={cn("group relative flex flex-col items-center text-center", locked && "cursor-not-allowed")}
                >
                  {point.status === "unlocked" ? (
                    <span className="mb-2 rounded-xl border-2 border-slate-200 bg-white px-4 py-1 text-sm font-black text-[#58cc02] shadow-sm">{text.start}</span>
                  ) : null}
                  <span
                    className={cn(
                      "grid size-20 place-items-center rounded-full border-b-8 text-white transition",
                      point.status === "passed" && "border-[#45a000] bg-[#58cc02]",
                      point.status === "unlocked" && "border-[#45a000] bg-[#58cc02] group-hover:-translate-y-1",
                      locked && "border-slate-300 bg-slate-200 text-slate-400",
                      activePoint?.id === point.id && "ring-8 ring-[#58cc02]/20"
                    )}
                  >
                    {locked ? <Lock size={30} /> : point.status === "passed" ? <Check size={34} strokeWidth={4} /> : <Sparkles size={32} />}
                  </span>
                  <span className="mt-3 max-w-56 rounded-2xl bg-white px-4 py-2 text-sm font-black text-ink shadow-sm ring-1 ring-slate-200">
                    {point.title}
                  </span>
                  <span className="mt-1 text-xs font-semibold text-slate-400">{point.questionCount} {text.questions}</span>
                </Link>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export function LearningCourseSwitcher({ activeCourseId, courses }: CourseSwitcherProps) {
  const [open, setOpen] = useState(false);
  const activeCourse = courses.find((course) => course.id === activeCourseId) || courses[0] || null;

  if (!activeCourse) {
    return null;
  }

  return (
    <div className="relative">
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex min-h-14 max-w-48 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300 hover:text-sky-600"
        type="button"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="min-w-0 truncate">{activeCourse.name}</span>
        <ChevronDown className={cn("shrink-0 transition", open && "rotate-180")} size={18} />
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-2xl border border-slate-200 bg-white text-ink shadow-[0_12px_32px_rgba(15,23,42,0.2)]">
          <div className="border-b border-slate-200 px-5 py-3">
            <p className="text-sm font-black text-slate-500">{text.myCourses}</p>
          </div>
          <div className="py-2">
            {courses.map((course) => {
              const active = course.id === activeCourse.id;
              return (
                <Link
                  key={course.id}
                  className={cn(
                    "flex min-h-14 items-center gap-3 px-5 py-3 text-left transition hover:bg-sky-50",
                    active && "bg-sky-50 text-sky-600"
                  )}
                  href={`/learn?course=${encodeURIComponent(course.id)}`}
                  onClick={() => setOpen(false)}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-black">{course.name}</span>
                  </span>
                  {active ? <Check className="shrink-0" size={18} strokeWidth={4} /> : null}
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
