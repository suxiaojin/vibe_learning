import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { AiStudyProjectLearningView } from "@/components/ai-study/project-learning-view";
import { requireUser } from "@/lib/auth";
import { ProjectPurchasePage } from "@/components/ai-study/project-purchase-page";
import { accessibleAiStudyProjectWhere, getStudyProjectOffer, StudyProjectAccessError } from "@/lib/study-project-access";
import { originalAiStudyProjectTitle } from "@/lib/ai-study-public-catalog";
import { prisma } from "@/lib/prisma";
import {
  formatAiStudyError,
  getAiStudyProject,
  listAiStudyProjectNodes
} from "@/lib/ai-study";

export default async function StudyBuddyProjectPage({
  params,
  searchParams
}: {
  params: Promise<{ projectId: string }>;
  searchParams?: Promise<{ node?: string; error?: string }>;
}) {
  const user = await requireUser();
  const { projectId } = await params;
  const query = await searchParams;

  let project: Awaited<ReturnType<typeof getAiStudyProject>>;
  let nodes: Awaited<ReturnType<typeof listAiStudyProjectNodes>>;

  try {
    const offer = await getStudyProjectOffer(user.id, "ai", projectId);
    if (offer.requiresPurchase) return <ProjectPurchasePage offer={offer} />;
    [project, nodes] = await Promise.all([
      getAiStudyProject(user.id, projectId),
      listAiStudyProjectNodes(user.id, projectId)
    ]);
  } catch (error) {
    const formatted = formatAiStudyError(error);
    if (formatted?.status === 404 || error instanceof StudyProjectAccessError) {
      redirect("/study-buddy?error=project_not_found");
    }
    throw error;
  }

  const canonicalId = project.canonicalProjectId || project.id;
  const parts = (project.ownerId === user.id || project.visibility === "public") && (project.partCount || 0) > 1
    ? await prisma.aiStudyProject.findMany({
        where: {
          AND: [
            accessibleAiStudyProjectWhere(user.id),
            {
              deletedAt: null,
              ...(project.ownerId === user.id ? {} : { visibility: "public" as const }),
              OR: [{ id: canonicalId }, { canonicalProjectId: canonicalId }]
            }
          ]
        },
        orderBy: [{ partIndex: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          title: true,
          partIndex: true,
          partCount: true,
          canonicalProjectId: true,
          tasks: {
            where: { type: "generate_cards" },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 1,
            select: { status: true }
          }
        }
      })
    : [];
  const expectedPartCount = Math.max(project.partCount || 1, ...parts.map((part) => part.partCount || 1));
  const unified = parts.some((part) => Boolean(part.canonicalProjectId))
    && (project.visibility === "public" || (parts.length === expectedPartCount && parts.every((part) => part.tasks[0]?.status === "succeeded")));
  const bookTitle = unified
    ? originalAiStudyProjectTitle(parts.find((part) => part.id === canonicalId)?.title || project.title)
    : undefined;

  return (
    <AiStudyProjectLearningView
      backHref="/study-buddy"
      backTitle="返回项目列表"
      displayTitle={bookTitle}
      headerAccessory={unified ? <StudyPartPicker currentId={project.id} parts={parts} /> : undefined}
      mode="student"
      nodeHrefBase={`/study-buddy/${project.id}`}
      nodes={nodes}
      project={project}
      queryError={query?.error}
      requestedNodeId={query?.node}
      viewerUserId={user.id}
    />
  );
}

function StudyPartPicker({ currentId, parts }: {
  currentId: string;
  parts: Array<{ id: string; title: string; partIndex: number | null; partCount: number | null }>;
}) {
  const current = parts.find((part) => part.id === currentId);
  const count = Math.max(parts.length, ...parts.map((part) => part.partCount || 1));
  return (
    <details className="group relative shrink-0">
      <summary className="flex cursor-pointer list-none items-center gap-1 rounded-lg border border-[#dce5e0] bg-white px-2.5 py-1.5 text-xs font-bold text-[#344054] [&::-webkit-details-marker]:hidden">
        第 {current?.partIndex || 1}/{count} 部分
        <ChevronDown className="transition-transform group-open:rotate-180" size={14} />
      </summary>
      <nav aria-label="切换学习部分" className="absolute left-0 top-full z-40 mt-2 max-h-72 w-44 overflow-y-auto rounded-xl border border-[#e4e8ee] bg-white p-1.5 shadow-lg">
        {parts.map((part, index) => (
          <Link
            aria-current={part.id === currentId ? "page" : undefined}
            className={`block rounded-lg px-3 py-2 text-sm font-semibold hover:bg-[#f2f8f4] ${part.id === currentId ? "bg-[#e8f7ee] text-[#0e8528]" : "text-[#344054]"}`}
            href={`/study-buddy/${part.id}`}
            key={part.id}
            title={part.title}
          >
            第 {part.partIndex || index + 1} 部分
          </Link>
        ))}
      </nav>
    </details>
  );
}
