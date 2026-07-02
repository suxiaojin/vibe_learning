import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ListTree,
  Sparkles,
  Target
} from "lucide-react";
import { KnowledgeMapView, type KnowledgeMapNode } from "@/components/ai-study/knowledge-map-view";
import { ResizableStudyPanels } from "@/components/ai-study/resizable-study-panels";
import { requireUser } from "@/lib/auth";
import {
  formatAiStudyError,
  getAiStudyNodeDetail,
  getAiStudyProject,
  listAiStudyProjectNodes
} from "@/lib/ai-study";
import { cn } from "@/lib/utils";

const projectStatusLabels = {
  draft: "待导入",
  processing: "生成中",
  ready: "可学习",
  failed: "生成失败",
  archived: "已归档"
};

const taskStatusLabels = {
  pending: "等待中",
  running: "执行中",
  succeeded: "已完成",
  failed: "失败",
  canceled: "已取消"
};

const taskTypeLabels = {
  parse_source: "解析资料",
  generate_outline: "生成思维导图",
  generate_cards: "生成知识卡片",
  generate_quiz: "生成测验",
  quality_check: "质量检查"
};

type NodeListItem = Awaited<ReturnType<typeof listAiStudyProjectNodes>>[number];

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
    [project, nodes] = await Promise.all([
      getAiStudyProject(user.id, projectId),
      listAiStudyProjectNodes(user.id, projectId)
    ]);
  } catch (error) {
    const formatted = formatAiStudyError(error);
    if (formatted?.status === 404) {
      redirect("/study-buddy?error=project_not_found");
    }
    throw error;
  }

  const tree = buildNodeTree(nodes);
  const orderedNodes = flattenTree(tree);
  const selectedNodeId = orderedNodes.find((node) => node.id === query?.node)?.id || orderedNodes[0]?.id || "";
  const selectedIndex = orderedNodes.findIndex((node) => node.id === selectedNodeId);
  const previousNode = selectedIndex > 0 ? orderedNodes[selectedIndex - 1] : null;
  const nextNode = selectedIndex >= 0 && selectedIndex < orderedNodes.length - 1 ? orderedNodes[selectedIndex + 1] : null;
  const nodeDetail = selectedNodeId ? await getAiStudyNodeDetail(user.id, selectedNodeId) : null;
  const card = nodeDetail?.card || null;
  const progressPercent = project.knowledgeCount > 0 ? Math.round((project.masteredCount / project.knowledgeCount) * 100) : 0;
  const generation = getGenerationProgress(project);

  return (
    <main className="min-h-dvh bg-[#f5f6f8] text-[#111827]">
      <header className="sticky top-0 z-30 border-b border-[#e7eaef] bg-[#f5f6f8]/95 px-5 py-3 backdrop-blur md:px-7">
        <div className="flex min-h-11 items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link className="grid size-9 shrink-0 place-items-center rounded-full text-[#111827] transition hover:bg-white" href="/study-buddy" title="返回项目列表">
              <ArrowLeft size={20} />
            </Link>
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <h1 className="truncate text-[18px] font-black tracking-normal text-[#06122b]">{project.title}</h1>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-[#7a8491]">{projectStatusLabels[project.status]}</span>
              </div>
              <div className="mt-1 flex items-center gap-3">
                <div className="h-[3px] w-40 overflow-hidden rounded-full bg-[#e4e8ee]">
                  <span className="block h-full rounded-full bg-[#28b83e]" style={{ width: `${project.status === "processing" ? generation.percent : progressPercent}%` }} />
                </div>
                <p className="text-xs font-black text-[#10a825]">
                  {project.status === "processing" ? `${generation.percent}% ${generation.text}` : `${project.masteredCount}/${project.knowledgeCount} 已掌握知识点`}
                </p>
              </div>
            </div>
          </div>
          <div className="hidden items-center gap-2 md:flex">
            <span className="rounded-full border border-[#e1e6ee] bg-white px-3 py-2 text-sm font-bold text-[#475467]">
              共 {project.knowledgeCount || nodes.length} 个节点
            </span>
          </div>
        </div>
      </header>

      {query?.error === "progress_failed" ? (
        <div className="mx-auto mt-4 max-w-[1780px] px-5 md:px-7">
          <div className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
            掌握状态更新失败，请稍后重试。
          </div>
        </div>
      ) : null}

      <ResizableStudyPanels
        left={<KnowledgeMapView nodes={tree} projectId={project.id} selectedNodeId={selectedNodeId} />}
      >
        <section className="min-h-[calc(100dvh-112px)] min-w-0 overflow-hidden rounded-[16px] bg-white shadow-[0_12px_32px_rgba(16,24,40,0.05)]">
          <div className="flex h-14 items-center justify-between border-b border-[#edf0f4] bg-[linear-gradient(96deg,#fff7e8_0%,#fffdf8_42%,#f8fbff_100%)] px-5">
            <h2 className="text-[17px] font-black text-[#101828]">知识卡片</h2>
            <div className="flex items-center gap-2">
              {previousNode ? (
                <Link className="grid size-9 place-items-center rounded-full text-[#344054] transition hover:bg-[#f4f6f8]" href={`/study-buddy/${project.id}?node=${previousNode.id}`} title="上一个知识点">
                  <ChevronLeft size={20} />
                </Link>
              ) : (
                <span className="grid size-9 place-items-center rounded-full text-[#c6ccd5]">
                  <ChevronLeft size={20} />
                </span>
              )}
              {nextNode ? (
                <Link className="grid size-9 place-items-center rounded-full text-[#344054] transition hover:bg-[#f4f6f8]" href={`/study-buddy/${project.id}?node=${nextNode.id}`} title="下一个知识点">
                  <ChevronRight size={20} />
                </Link>
              ) : (
                <span className="grid size-9 place-items-center rounded-full text-[#c6ccd5]">
                  <ChevronRight size={20} />
                </span>
              )}
            </div>
          </div>

          {nodeDetail ? (
            <article className="max-h-[calc(100dvh-168px)] overflow-y-auto px-6 py-6 md:px-8">
              <div className={cn("rounded-[14px] px-5 py-5", nodeDetail.depth === 0 ? "bg-[linear-gradient(110deg,#f6ffe9_0%,#f7fff5_44%,#effbff_100%)]" : "bg-white")}>
                <h3 className="text-[22px] font-black leading-tight tracking-normal text-[#07152f] md:text-[24px]">{nodeDetail.title}</h3>
              </div>

              {card ? (
                <div className="mt-6 space-y-7">
                  <CardSection icon={<BookOpen size={18} />} title="内容概述">
                    <p className="text-[16px] leading-8 text-[#1f2937]">{card.overview}</p>
                  </CardSection>

                  {nodeDetail.depth === 0 ? (
                    <CardList icon={<Target size={18} />} items={stringArray(card.keyPoints)} title="你能学到啥" />
                  ) : null}

                  {nodeDetail.depth === 1 || nodeDetail.depth === 2 ? (
                    <CardList icon={<ListTree size={18} />} items={stringArray(card.keyPoints)} title="本节知识点" />
                  ) : null}

                  {nodeDetail.depth >= 3 ? (
                    <CardSection icon={<Sparkles size={18} />} title="AI详解">
                      <p className="whitespace-pre-wrap text-[16px] leading-8 text-[#1f2937]">{card.explanation || card.overview}</p>
                    </CardSection>
                  ) : null}
                </div>
              ) : (
                <GenerationPanel
                  description="思维导图已经生成，AI 正在继续制作当前节点的知识卡片。"
                  icon={<BookOpen size={28} />}
                  project={project}
                  title="知识卡片生成中"
                />
              )}
            </article>
          ) : (
            <div className="px-6 py-6 md:px-8">
              <GenerationPanel
                description="资料提交后，AI 会先解析 PDF，再生成四层知识图谱和分层知识卡片。"
                icon={<Sparkles size={28} />}
                project={project}
                title={project.status === "failed" ? "生成失败" : "搭子加急制作中"}
              />
            </div>
          )}
        </section>
      </ResizableStudyPanels>
    </main>
  );
}

function GenerationPanel({
  description,
  icon,
  project,
  title
}: {
  description: string;
  icon: ReactNode;
  project: Awaited<ReturnType<typeof getAiStudyProject>>;
  title: string;
}) {
  const generation = getGenerationProgress(project);
  return (
    <div className="rounded-[16px] border border-[#edf0f4] bg-[#fbfcfd] px-6 py-8">
      <div className="flex items-start gap-4">
        <span className="grid size-14 shrink-0 place-items-center rounded-[18px] bg-[#effaf0] text-[#16a329]">{icon}</span>
        <div className="min-w-0">
          <h3 className="text-xl font-black text-[#101828]">{title}</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#667085]">{description}</p>
          <div className="mt-5 h-2 max-w-xl overflow-hidden rounded-full bg-[#e7ebf0]">
            <span className="block h-full rounded-full bg-[#24b43a]" style={{ width: `${generation.percent}%` }} />
          </div>
          <p className="mt-2 text-sm font-black text-[#16a329]">{generation.percent}% {generation.text}</p>
        </div>
      </div>
      <div className="mt-7 grid gap-3 md:grid-cols-3">
        {project.tasks.slice().reverse().map((task) => (
          <div key={task.id} className="rounded-[12px] border border-[#e5e9ef] bg-white px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-black text-[#101828]">{taskTypeLabels[task.type]}</p>
              <span className={cn("rounded-full px-2 py-0.5 text-xs font-black", getTaskStatusClass(task.status))}>
                {taskStatusLabels[task.status]}
              </span>
            </div>
            {task.stage ? <p className="mt-2 line-clamp-2 text-xs font-medium leading-5 text-[#98a2b3]">{task.stage}</p> : null}
            {task.errorMessage ? <p className="mt-2 line-clamp-3 text-xs font-semibold leading-5 text-red-600">{task.errorMessage}</p> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function CardSection({ children, icon, title }: { children: ReactNode; icon: ReactNode; title: string }) {
  return (
    <section>
      <div className="flex items-center gap-2">
        <span className="text-[#16a329]">{icon}</span>
        <h4 className="text-[19px] font-black text-[#101828]">{title}</h4>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function CardList({ icon, items, title }: { icon: ReactNode; items: string[]; title: string }) {
  if (items.length === 0) {
    return null;
  }
  return (
    <CardSection icon={icon} title={title}>
      <ul className="space-y-3">
        {items.map((item, index) => (
          <li key={`${item}-${index}`} className="flex gap-3 text-[16px] leading-7 text-[#1f2937]">
            <span className="mt-3 size-1.5 shrink-0 rounded-full bg-[#98a2b3]" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </CardSection>
  );
}

function buildNodeTree(nodes: NodeListItem[]) {
  const sortedNodes = [...nodes].sort((left, right) => left.depth - right.depth || left.sortOrder - right.sortOrder || left.title.localeCompare(right.title, "zh-CN"));
  const byId = new globalThis.Map(sortedNodes.map((node) => [node.id, {
    id: node.id,
    parentId: node.parentId,
    title: node.title,
    depth: node.depth,
    sortOrder: node.sortOrder,
    progressStatus: node.progress[0]?.status || "not_started",
    children: [] as KnowledgeMapNode[]
  }]));
  const roots: KnowledgeMapNode[] = [];

  for (const node of sortedNodes) {
    const treeNode = byId.get(node.id);
    if (!treeNode) {
      continue;
    }
    const parent = node.parentId ? byId.get(node.parentId) : null;
    if (parent) {
      parent.children.push(treeNode);
    } else {
      roots.push(treeNode);
    }
  }

  sortTree(roots);
  return roots;
}

function sortTree(nodes: KnowledgeMapNode[]) {
  nodes.sort((left, right) => left.sortOrder - right.sortOrder || left.title.localeCompare(right.title, "zh-CN"));
  for (const node of nodes) {
    sortTree(node.children);
  }
}

function flattenTree(nodes: KnowledgeMapNode[]) {
  const flattened: KnowledgeMapNode[] = [];
  function walk(node: KnowledgeMapNode) {
    flattened.push(node);
    for (const child of node.children) {
      walk(child);
    }
  }
  for (const node of nodes) {
    walk(node);
  }
  return flattened;
}

function getGenerationProgress(project: Awaited<ReturnType<typeof getAiStudyProject>>) {
  if (project.status === "ready") {
    return { percent: 100, text: "知识图谱已生成" };
  }
  if (project.status === "failed") {
    return { percent: 100, text: "生成失败" };
  }
  if (project.status !== "processing") {
    return { percent: 0, text: "等待创建" };
  }

  const parseTask = project.tasks.find((task) => task.type === "parse_source");
  const outlineTask = project.tasks.find((task) => task.type === "generate_outline");
  const cardTask = project.tasks.find((task) => task.type === "generate_cards");

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

function getTaskStatusClass(status: keyof typeof taskStatusLabels) {
  if (status === "failed") {
    return "bg-red-100 text-red-700";
  }
  if (status === "succeeded") {
    return "bg-[#e8f8e9] text-[#14a327]";
  }
  if (status === "running") {
    return "bg-[#fff4d6] text-[#a56800]";
  }
  return "bg-[#f1f3f6] text-[#7a8491]";
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}
