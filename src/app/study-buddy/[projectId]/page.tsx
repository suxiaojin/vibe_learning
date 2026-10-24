import { redirect } from "next/navigation";
import { AiStudyProjectLearningView } from "@/components/ai-study/project-learning-view";
import { StudyPartPicker } from "@/components/ai-study/study-part-picker";
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
  searchParams?: Promise<{ node?: string; error?: string; selectPart?: string }>;
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
  const resumePart = !query?.node && query?.selectPart !== "1";
  const partStorageKey = `vibe-ai-study-last-part:v1:${user.id}:${canonicalId}`;

  return (
    <AiStudyProjectLearningView
      backHref="/study-buddy"
      backTitle="返回项目列表"
      displayTitle={bookTitle}
      headerAccessory={unified ? <StudyPartPicker
        canonicalId={canonicalId}
        currentId={project.id}
        parts={parts}
        resume={resumePart}
        storageKey={partStorageKey}
      /> : undefined}
      mode="student"
      nodeHrefBase={`/study-buddy/${project.id}`}
      nodes={nodes}
      partResume={unified && resumePart && project.id === canonicalId ? {
        storageKey: partStorageKey,
        validPartIds: parts.map((part) => part.id)
      } : undefined}
      project={project}
      queryError={query?.error}
      requestedNodeId={query?.node}
      viewerUserId={user.id}
    />
  );
}
