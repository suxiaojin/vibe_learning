import { notFound } from "next/navigation";
import { AiStudyProjectLearningView } from "@/components/ai-study/project-learning-view";
import { requireAdmin } from "@/lib/auth";
import { getAdminAiStudyProject } from "@/lib/admin-ai-study-projects";
import { listAiStudyProjectNodes } from "@/lib/ai-study";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  params: Promise<{ projectId: string }>;
  searchParams?: Promise<{ node?: string }>;
};

export default async function AdminAiStudyProjectPreviewPage({ params, searchParams }: PageProps) {
  await requireAdmin();
  const { projectId } = await params;
  const query = await searchParams;
  const project = await getAdminAiStudyProject(projectId);
  if (!project) {
    notFound();
  }

  const nodes = await listAiStudyProjectNodes(project.owner.id, project.id);

  return (
    <AiStudyProjectLearningView
      backHref={`/admin/ai-study-projects/${project.id}`}
      backTitle="返回项目详情"
      headerAccessory={<span className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-[#667085] ring-1 ring-[#e4e8ee]">只读预览</span>}
      mode="admin-preview"
      nodeHrefBase={`/admin/ai-study-projects/${project.id}/preview`}
      nodes={nodes}
      project={project}
      requestedNodeId={query?.node}
      viewerUserId={project.owner.id}
    />
  );
}
