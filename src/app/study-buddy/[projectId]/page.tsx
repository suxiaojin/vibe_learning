import { redirect } from "next/navigation";
import { AiStudyProjectLearningView } from "@/components/ai-study/project-learning-view";
import { requireUser } from "@/lib/auth";
import { ProjectPurchasePage } from "@/components/ai-study/project-purchase-page";
import { getStudyProjectOffer, StudyProjectAccessError } from "@/lib/study-project-access";
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

  return (
    <AiStudyProjectLearningView
      backHref="/study-buddy"
      backTitle="返回项目列表"
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
