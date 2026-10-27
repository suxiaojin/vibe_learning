"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { AiStudyProjectCard } from "@/components/ai-study/project-card";
import {
  OfficialStudyMaterialCard,
  type OfficialStudyMaterialCardItem
} from "@/components/ai-study/official-study-material-card";

type ProjectStatus = "draft" | "processing" | "ready" | "failed" | "archived";

export type AiStudyProjectSectionItem = {
  kind: "ai-project";
  canManage: boolean;
  contentOverview: string;
  diamondPrice?: number;
  purchased?: boolean;
  owned?: boolean;
  generationPercent: number;
  generationText: string;
  learningAvailable?: boolean;
  linkedPartCount?: number;
  id: string;
  knowledgeCount: number;
  learnerText: string;
  masteredCount: number;
  ownerName: string;
  ownerProfileHref: string;
  sourceCount: number;
  status: ProjectStatus;
  title: string;
};

export type StudyBuddySectionItem = AiStudyProjectSectionItem | OfficialStudyMaterialCardItem;

type AiStudyProjectSectionProps = {
  title: string;
  projects: StudyBuddySectionItem[];
  emptyText: string;
  enableTagFilter?: boolean;
  loadMoreStep?: number;
};

type ProjectFilter = { kind: "all" } | { kind: "purchased" } | { kind: "tag"; key: string };

const initialProjectCount = 10;

export function AiStudyProjectSection({ title, projects, emptyText, enableTagFilter = false, loadMoreStep }: AiStudyProjectSectionProps) {
  const [activeFilter, setActiveFilter] = useState<ProjectFilter>({ kind: "all" });
  const [visibleCount, setVisibleCount] = useState(initialProjectCount);
  const tagFilters = enableTagFilter ? buildTagFilters(projects) : [];
  const purchasedCount = enableTagFilter ? filterPublicProjects(projects, { kind: "purchased" }).length : 0;
  const filteredProjects = enableTagFilter ? filterPublicProjects(projects, activeFilter) : projects;
  const visibleProjects = filteredProjects.slice(0, visibleCount);
  const hasMore = filteredProjects.length > visibleCount;

  function selectFilter(filter: ProjectFilter) {
    setActiveFilter(filter);
    setVisibleCount(initialProjectCount);
  }

  return (
    <section className="mt-9">
      <h2 className="text-[20px] font-bold tracking-normal text-[#101828]">{title}</h2>
      {enableTagFilter ? (
        <nav aria-label="公开项目 Tag" className="mt-4 flex gap-8 overflow-x-auto pb-1">
          <button
            aria-pressed={activeFilter.kind === "all"}
            className={`relative shrink-0 pb-3 text-[14px] transition ${activeFilter.kind === "all" ? "font-semibold text-[#202939] after:absolute after:bottom-0 after:left-1/2 after:h-0.5 after:w-4 after:-translate-x-1/2 after:bg-[#202939]" : "font-normal text-[#98a2b3] hover:text-[#475467]"}`}
            onClick={() => selectFilter({ kind: "all" })}
            type="button"
          >
            全部
          </button>
          <button
            aria-pressed={activeFilter.kind === "purchased"}
            className={`relative shrink-0 pb-3 text-[14px] transition ${activeFilter.kind === "purchased" ? "font-semibold text-[#202939] after:absolute after:bottom-0 after:left-1/2 after:h-0.5 after:w-4 after:-translate-x-1/2 after:bg-[#202939]" : "font-normal text-[#98a2b3] hover:text-[#475467]"}`}
            onClick={() => selectFilter({ kind: "purchased" })}
            type="button"
          >
            已购买（{purchasedCount}）
          </button>
          {tagFilters.map((tag) => (
            <button
              aria-pressed={activeFilter.kind === "tag" && activeFilter.key === tag.key}
              className={`relative shrink-0 pb-3 text-[14px] transition ${activeFilter.kind === "tag" && activeFilter.key === tag.key ? "font-semibold text-[#202939] after:absolute after:bottom-0 after:left-1/2 after:h-0.5 after:w-4 after:-translate-x-1/2 after:bg-[#202939]" : "font-normal text-[#98a2b3] hover:text-[#475467]"}`}
              key={tag.key}
              onClick={() => selectFilter({ kind: "tag", key: tag.key })}
              type="button"
            >
              {tag.label}（{tag.count}）
            </button>
          ))}
        </nav>
      ) : null}
      <div className="mt-5 grid grid-cols-1 justify-items-start gap-5 sm:grid-cols-[repeat(auto-fill,minmax(260px,284px))]">
        {filteredProjects.length > 0 ? (
          visibleProjects.map((project) => project.kind === "official-material" ? (
            <OfficialStudyMaterialCard key={`material-${project.id}`} material={project} />
          ) : (
            <AiStudyProjectCard
              key={`project-${project.id}`}
              canManage={project.canManage}
              contentOverview={project.contentOverview}
              diamondPrice={project.diamondPrice}
              purchased={project.purchased}
              owned={project.owned}
              generationPercent={project.generationPercent}
              generationText={project.generationText}
              learningAvailable={project.learningAvailable}
              linkedPartCount={project.linkedPartCount}
              id={project.id}
              knowledgeCount={project.knowledgeCount}
              learnerText={project.learnerText}
              masteredCount={project.masteredCount}
              ownerName={project.ownerName}
              ownerProfileHref={project.ownerProfileHref}
              sourceCount={project.sourceCount}
              status={project.status}
              title={project.title}
            />
          ))
        ) : (
          <div className="flex min-h-[150px] w-full max-w-[620px] items-center rounded-[22px] border border-dashed border-[#dfe5ec] bg-[#fbfcfd] px-6 text-sm font-medium text-[#98a2b3] sm:col-span-full">
            {activeFilter.kind === "purchased" ? "暂无已购买项目。" : activeFilter.kind === "tag" ? "该分类暂无项目。" : emptyText}
          </div>
        )}
      </div>

      {hasMore ? (
        <div className="mt-6 flex justify-center">
          <button
            className="inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[14px] font-semibold text-[#111827] transition hover:bg-[#f4f6f8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111827]"
            onClick={() => setVisibleCount((current) => getNextVisibleCount(current, filteredProjects.length, loadMoreStep))}
            type="button"
          >
            查看更多
            <ChevronDown size={17} strokeWidth={2.5} />
          </button>
        </div>
      ) : null}
    </section>
  );
}

export function buildTagFilters(projects: StudyBuddySectionItem[]) {
  const filters = new Map<string, { key: string; label: string; count: number }>();
  for (const project of projects) {
    if (project.kind !== "official-material" || project.purchased) {
      continue;
    }
    const label = project.tag.trim();
    if (!label) {
      continue;
    }
    const key = normalizeTag(label);
    const current = filters.get(key);
    if (current) {
      current.count += 1;
    } else {
      filters.set(key, { key, label, count: 1 });
    }
  }
  return Array.from(filters.values());
}

export function filterPublicProjects(projects: StudyBuddySectionItem[], filter: ProjectFilter) {
  if (filter.kind === "purchased") {
    return projects.filter((project) => project.purchased);
  }
  if (filter.kind === "tag") {
    return projects.filter((project) => !project.purchased && project.kind === "official-material" && normalizeTag(project.tag) === filter.key);
  }
  return projects.filter((project) => !project.purchased);
}

export function getNextVisibleCount(current: number, total: number, step?: number) {
  return Math.min(total, step ? current + step : total);
}

export function normalizeTag(value: string) {
  return value.trim().normalize("NFKC").toLowerCase();
}
