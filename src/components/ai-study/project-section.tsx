"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { AiStudyProjectCard } from "@/components/ai-study/project-card";

type ProjectStatus = "draft" | "processing" | "ready" | "failed" | "archived";

export type AiStudyProjectSectionItem = {
  canManage: boolean;
  contentOverview: string;
  generationPercent: number;
  generationText: string;
  id: string;
  knowledgeCount: number;
  latestFailedRetryCount: number;
  learnerText: string;
  masteredCount: number;
  ownerName: string;
  sourceCount: number;
  status: ProjectStatus;
  title: string;
};

type AiStudyProjectSectionProps = {
  title: string;
  projects: AiStudyProjectSectionItem[];
  emptyText: string;
};

const initialProjectCount = 10;

export function AiStudyProjectSection({ title, projects, emptyText }: AiStudyProjectSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const visibleProjects = expanded ? projects : projects.slice(0, initialProjectCount);
  const hasMore = projects.length > initialProjectCount && !expanded;

  return (
    <section className="mt-9">
      <h2 className="text-[22px] font-black tracking-normal text-[#101828]">{title}</h2>
      <div className="mt-5 grid grid-cols-1 justify-items-start gap-5 sm:grid-cols-[repeat(auto-fill,minmax(260px,284px))]">
        {projects.length > 0 ? (
          visibleProjects.map((project) => (
            <AiStudyProjectCard
              key={project.id}
              canManage={project.canManage}
              contentOverview={project.contentOverview}
              generationPercent={project.generationPercent}
              generationText={project.generationText}
              id={project.id}
              knowledgeCount={project.knowledgeCount}
              latestFailedRetryCount={project.latestFailedRetryCount}
              learnerText={project.learnerText}
              masteredCount={project.masteredCount}
              ownerName={project.ownerName}
              sourceCount={project.sourceCount}
              status={project.status}
              title={project.title}
            />
          ))
        ) : (
          <div className="flex min-h-[150px] w-full max-w-[620px] items-center rounded-[22px] border border-dashed border-[#dfe5ec] bg-[#fbfcfd] px-6 text-sm font-medium text-[#98a2b3] sm:col-span-full">
            {emptyText}
          </div>
        )}
      </div>

      {hasMore ? (
        <div className="mt-6 flex justify-center">
          <button
            className="inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[15px] font-black text-[#111827] transition hover:bg-[#f4f6f8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111827]"
            onClick={() => setExpanded(true)}
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
