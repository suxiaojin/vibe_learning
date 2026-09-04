import { AlertTriangle } from "lucide-react";
import { StudyMaterialImporter } from "@/components/ai-study/pdf-upload-form";
import { AiStudyProjectSection, type AiStudyProjectSectionItem } from "@/components/ai-study/project-section";
import type { OfficialStudyMaterialCardItem } from "@/components/ai-study/official-study-material-card";
import { StudyBuddyHeroTitle } from "@/components/ai-study/study-buddy-hero-title";
import { StudentSidebar } from "@/components/student-sidebar";
import { requireUser } from "@/lib/auth";
import { listAiStudyProjects, listPublicAiStudyProjects } from "@/lib/ai-study";
import { listPublicOfficialStudyMaterials } from "@/lib/official-study-materials";
import { getSystemSettings } from "@/lib/system-settings";
import { prisma } from "@/lib/prisma";

const errorMessages: Record<string, string> = {
  create_failed: "项目创建失败，请稍后重试。",
  pdf_upload_failed: "PDF 上传失败，请稍后重试。",
  delete_failed: "项目删除失败，请稍后重试。"
};

type PersonalProject = Awaited<ReturnType<typeof listAiStudyProjects>>[number];
type PublicProject = Awaited<ReturnType<typeof listPublicAiStudyProjects>>[number];
type StudyProject = PersonalProject | PublicProject;
type OfficialMaterial = Awaited<ReturnType<typeof listPublicOfficialStudyMaterials>>[number];

export default async function StudyBuddyPage({
  searchParams
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const [settings, projects, publicProjects, officialMaterials] = await Promise.all([
    getSystemSettings(),
    listAiStudyProjects(user.id),
    listPublicAiStudyProjects(),
    listPublicOfficialStudyMaterials({ userId: user.id })
  ]);
  const error = params?.error ? errorMessages[params.error] || "操作失败，请稍后重试。" : "";

  return (
    <main className="min-h-dvh bg-white text-[#111827] lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
      <StudentSidebar active="study-buddy" />

      <section className="min-w-0 px-6 pb-16 pt-10 lg:px-12">
        <div className="mx-auto w-full max-w-[1504px]">
          <header className="flex items-center gap-6">
            <img
              alt=""
              className="h-[110px] w-[160px] object-contain"
              height={110}
              src={settings.studyBuddyHeroImageUrl}
              width={160}
            />
            <div className="pb-2">
              <StudyBuddyHeroTitle
                effect={settings.studyBuddyHeroEffect}
                speedMs={settings.studyBuddyHeroTypeSpeedMs}
                text={settings.studyBuddyHeroTitle}
              />
              <div className="mt-4">
                <StudyMaterialImporter />
              </div>
            </div>
          </header>

          {error ? (
            <div className="mt-6 flex max-w-2xl items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              {error}
            </div>
          ) : null}

          <ProjectSection emptyText="还没有上传资料，点击上方按钮导入第一份学习资料。" projects={projects} title="我的项目" />
          <PublicProjectSection aiProjects={publicProjects} materials={officialMaterials} userId={user.id} />
        </div>
      </section>
    </main>
  );
}

function ProjectSection({
  title,
  projects,
  emptyText
}: {
  title: string;
  projects: StudyProject[];
  emptyText: string;
}) {
  const cardProjects = buildProjectSectionItems(projects, "personal");

  return (
    <AiStudyProjectSection emptyText={emptyText} projects={cardProjects} title={title} />
  );
}

async function PublicProjectSection({
  aiProjects,
  materials,
  userId
}: {
  aiProjects: PublicProject[];
  materials: OfficialMaterial[];
  userId: string;
}) {
  const purchases = await prisma.studyProjectPurchase.findMany({
    where: {
      userId,
      OR: [
        { kind: "ai", resourceId: { in: aiProjects.map((project) => project.id) } },
        { kind: "official", resourceId: { in: materials.map((material) => material.id) } }
      ]
    },
    select: { kind: true, resourceId: true }
  });
  const purchasedAiIds = new Set(purchases.filter((purchase) => purchase.kind === "ai").map((purchase) => purchase.resourceId));
  const purchasedMaterialIds = new Set(purchases.filter((purchase) => purchase.kind === "official").map((purchase) => purchase.resourceId));
  const officialItems = materials.map((material) => ({
    kind: "official-material",
    id: material.id,
    title: material.title,
    description: material.description || "",
    diamondPrice: material.diamondPrice,
    purchased: purchasedMaterialIds.has(material.id),
    fileType: material.fileType,
    fileSizeBytes: material.fileSizeBytes
  } satisfies OfficialStudyMaterialCardItem));
  const aiItems = buildProjectSectionItems(aiProjects, "public", purchasedAiIds, userId);
  return (
    <AiStudyProjectSection
      emptyText="暂无公开项目。"
      projects={[...officialItems, ...aiItems]}
      title="公开项目"
    />
  );
}

function buildProjectSectionItems(projects: StudyProject[], variant: "personal" | "public", purchasedIds: ReadonlySet<string> = new Set(), viewerUserId?: string) {
  return projects.map((project) => {
    const progressTotal = project.knowledgeCount || project._count.nodes || 0;
    const ownerName = "owner" in project ? project.owner.username : "由我创建";
    const ownerProfileHref = "owner" in project ? `/students/${project.owner.id}` : "";
    const learnerText = variant === "public" ? "公开学习项目" : `${project._count.sources || 1}份资料`;
    const generation = getGenerationProgress(project);

    return {
      kind: "ai-project",
      canManage: variant === "personal",
      contentOverview: getProjectContentOverview(project),
      diamondPrice: variant === "public" ? project.diamondPrice : undefined,
      purchased: purchasedIds.has(project.id),
      owned: variant === "personal" || project.ownerId === viewerUserId,
      generationPercent: generation.percent,
      generationText: generation.text,
      id: project.id,
      knowledgeCount: progressTotal,
      learnerText,
      masteredCount: project.masteredCount || 0,
      ownerName,
      ownerProfileHref,
      sourceCount: project._count.sources,
      status: project.status,
      title: project.title
    } satisfies AiStudyProjectSectionItem;
  });
}

function getProjectContentOverview(project: StudyProject) {
  const rootNode = project.nodes[0] || null;
  return rootNode?.cards[0]?.overview || rootNode?.summary || project.description || "";
}

function getGenerationProgress(project: StudyProject) {
  if ("generationProgress" in project && project.generationProgress) {
    return {
      percent: project.generationProgress.percent,
      text: project.generationProgress.text
    };
  }

  if (project.status === "ready") {
    return { percent: 100, text: "知识图谱已生成" };
  }
  if (project.status === "failed") {
    return { percent: 100, text: "项目解析失败" };
  }
  if (project.status !== "processing") {
    return { percent: 0, text: "等待创建" };
  }

  const tasks: Array<{ type: string; status: string; stage: string | null }> =
    "tasks" in project && Array.isArray(project.tasks) ? project.tasks : [];
  const parseTask = tasks.find((task) => task.type === "parse_source");
  const outlineTask = tasks.find((task) => task.type === "generate_outline");
  const cardTask = tasks.find((task) => task.type === "generate_cards");

  if (cardTask?.status === "running") {
    const match = String(cardTask.stage || "").match(/generating_card_(\d+)_of_(\d+)/);
    if (match) {
      const current = Number(match[1]);
      const total = Number(match[2]);
      const cardPercent = total > 0 ? Math.round((current / total) * 28) : 0;
      return { percent: Math.min(94, 66 + cardPercent), text: "正在生成知识卡片..." };
    }
    return { percent: 72, text: "正在生成知识卡片..." };
  }
  if (cardTask?.status === "pending") {
    return { percent: 66, text: "等待生成知识卡片..." };
  }
  if (outlineTask?.status === "running") {
    return { percent: 46, text: "正在生成思维导图..." };
  }
  if (outlineTask?.status === "pending") {
    return { percent: 38, text: "等待生成思维导图..." };
  }
  if (parseTask?.status === "running") {
    return { percent: 18, text: "正在解析资料..." };
  }
  return { percent: 8, text: "搭子加急制作中..." };
}
