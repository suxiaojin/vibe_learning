import Link from "next/link";
import { QuestionBankKnowledgeMap, type KnowledgeMapNode, type KnowledgeMapOwner } from "@/components/question-bank-knowledge-map";
import { requireAdmin } from "@/lib/auth";
import { ensureDefaultQuestionBankCatalog, type QuestionBankOwnerType } from "@/lib/question-bank-catalog";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";

type SearchParams = {
  type?: string;
  id?: string;
};

type SyllabusItem = {
  id: string;
  courseId: string;
  parentId: string | null;
  code: string | null;
  title: string;
  sortOrder: number;
};

type OwnerOption = KnowledgeMapOwner & {
  sortOrder: number;
};

function isOwnerType(value?: string): value is QuestionBankOwnerType {
  return value === "public_subject" || value === "major";
}

function ownerKey(owner: Pick<KnowledgeMapOwner, "type" | "id">) {
  return `${owner.type}:${owner.id}`;
}

function ownerQuestionBankHref(owner: KnowledgeMapOwner) {
  return `/admin/question-banks?type=${owner.type}&id=${encodeURIComponent(owner.id)}&page=1`;
}

function ownerKnowledgeMapHref(owner: KnowledgeMapOwner) {
  return `/admin/question-banks/knowledge-points?type=${owner.type}&id=${encodeURIComponent(owner.id)}`;
}

function sortNodes(nodes: KnowledgeMapNode[]) {
  nodes.sort((left, right) => {
    const codeCompare = (left.code || "").localeCompare(right.code || "", "zh-Hans-CN", { numeric: true });
    return codeCompare || left.title.localeCompare(right.title, "zh-Hans-CN");
  });
  nodes.forEach((node) => sortNodes(node.children));
}

function buildSyllabusTree(items: SyllabusItem[]) {
  const nodes = new Map<string, KnowledgeMapNode>();
  const roots: KnowledgeMapNode[] = [];

  items.forEach((item) => {
    nodes.set(item.id, {
      id: item.id,
      courseId: item.courseId,
      parentId: item.parentId,
      code: item.code,
      title: item.title,
      children: []
    });
  });

  items.forEach((item) => {
    const node = nodes.get(item.id);
    if (!node) {
      return;
    }
    if (item.parentId && nodes.has(item.parentId)) {
      nodes.get(item.parentId)?.children.push(node);
      return;
    }
    roots.push(node);
  });

  sortNodes(roots);
  return roots;
}

export default async function QuestionBankKnowledgePointsPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  await requireAdmin();
  await ensureDefaultQuestionBankCatalog();

  const params = await searchParams;
  const [publicSubjects, majors] = await Promise.all([
    prisma.publicSubject.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
    }),
    prisma.major.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
    })
  ]);

  const owners: OwnerOption[] = [
    ...publicSubjects.map((subject) => ({
      type: "public_subject" as const,
      id: subject.id,
      name: subject.name,
      sortOrder: subject.sortOrder
    })),
    ...majors.map((major) => ({
      type: "major" as const,
      id: major.id,
      name: major.name,
      sortOrder: major.sortOrder
    }))
  ].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) {
      return a.sortOrder - b.sortOrder;
    }
    if (a.type !== b.type) {
      return a.type === "public_subject" ? -1 : 1;
    }
    return a.name.localeCompare(b.name, "zh-Hans-CN");
  });

  const requestedType = isOwnerType(params?.type) ? params.type : undefined;
  const requestedOwner = owners.find((owner) => owner.type === requestedType && owner.id === params?.id);
  const computerOwner = owners.find((owner) => owner.type === "major" && owner.name.includes("计算机"));
  const selectedOwner = requestedOwner || computerOwner || owners[0];

  if (!selectedOwner) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f3f5f9] text-sm text-slate-500">
        暂无可展示的知识点。
      </main>
    );
  }

  const courses = await prisma.learningCourse.findMany({
    where: {
      courseType: selectedOwner.type,
      ...(selectedOwner.type === "public_subject" ? { publicSubjectId: selectedOwner.id } : { majorId: selectedOwner.id })
    },
    include: {
      syllabusItems: {
        select: {
          id: true,
          courseId: true,
          parentId: true,
          code: true,
          title: true,
          sortOrder: true
        },
        orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }, { code: "asc" }]
      }
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
  });

  const root: KnowledgeMapNode = {
    id: ownerKey(selectedOwner),
    title: selectedOwner.name,
    children: courses.map((course) => ({
      id: course.id,
      courseId: course.id,
      title: course.name,
      code: null,
      children: buildSyllabusTree(course.syllabusItems)
    }))
  };

  return (
    <main className="min-h-screen bg-[#f3f5f9] text-[#081a33]">
      <header className="grid h-[51px] grid-cols-[1fr_auto] border-b border-[#d6dbe4] bg-[#f7f8fb]">
        <nav className="flex" aria-label="内容管理">
          {[
            { label: "题库", href: ownerQuestionBankHref(selectedOwner), active: false },
            { label: "课件", href: "/admin/public-subjects", active: false },
            { label: "知识点", href: ownerKnowledgeMapHref(selectedOwner), active: true }
          ].map((tab) => (
            <Link
              key={tab.label}
              href={tab.href}
              className={cn(
                "grid h-[50px] min-w-[100px] place-items-center border-r border-[#e1e5ec] px-8 text-sm font-medium",
                tab.active ? "bg-[#e9edf3] text-[#071b38]" : "text-[#344054] hover:bg-white"
              )}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
        <Link className="grid h-[50px] w-24 place-items-center text-sm font-semibold text-[#071b38] hover:bg-white" href="/admin" aria-label="返回首页">
          首页
        </Link>
      </header>

      <QuestionBankKnowledgeMap
        owners={owners.map((owner) => ({ type: owner.type, id: owner.id, name: owner.name }))}
        selectedOwner={{ type: selectedOwner.type, id: selectedOwner.id, name: selectedOwner.name }}
        selectedOwnerKey={ownerKey(selectedOwner)}
        root={root}
      />
    </main>
  );
}
