"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentAdmin, requireAdmin } from "@/lib/auth";
import { clearAiStudyProgressCache } from "@/lib/ai-study-progress-cache";
import { prisma } from "@/lib/prisma";
import { setProjectDiamondPriceSchema } from "@/lib/project-diamond-price";

export async function setStudyProjectDiamondPrice(input: unknown) {
  if (!await getCurrentAdmin()) {
    return { ok: false as const, error: "请先登录管理后台。" };
  }
  const parsed = setProjectDiamondPriceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "请填写有效的非负整数钻石数量。" };
  }
  const { kind, id, diamondPrice } = parsed.data;
  // Only save the advertised price. Access and diamond accounting are unchanged.
  if (kind === "ai") {
    const project = await prisma.aiStudyProject.findUnique({ where: { id }, select: { partGroupId: true, partCount: true } });
    if (project?.partGroupId && (project.partCount ?? 0) > 1) {
      return { ok: false as const, error: "分部项目请在项目列表中统一设置价格。" };
    }
  }
  const result = kind === "official"
    ? await prisma.officialStudyMaterial.updateMany({
      where: { id, deletedAt: null }, data: { diamondPrice }
    })
    : await prisma.aiStudyProject.updateMany({
      where: kind === "ai_group"
        ? { partGroupId: id, partCount: { gt: 1 }, deletedAt: null }
        : { id, deletedAt: null },
      data: { diamondPrice }
    });
  if (result.count === 0) {
    return { ok: false as const, error: "项目不存在或已删除，价格未保存。" };
  }
  revalidatePath("/admin/ai-study-projects");
  revalidatePath("/study-buddy");
  return { ok: true as const, diamondPrice };
}

export async function publishAiStudyProject(formData: FormData) {
  await requireAdmin();
  const projectId = String(formData.get("projectId") || "");
  const groupId = String(formData.get("groupId") || "");
  const returnTo = getReturnTo(formData);
  if (groupId) {
    const result = await prisma.$transaction(async (tx) => {
      const parts = await tx.aiStudyProject.findMany({
        where: { partGroupId: groupId, partCount: { gt: 1 }, deletedAt: null },
        select: {
          id: true, status: true, partCount: true, canonicalProjectId: true, learningReadyAt: true,
          tasks: { where: { type: "generate_cards", status: "succeeded" }, select: { id: true }, take: 1 }
        }
      });
      if (parts.length === 0) return { status: "unavailable" as const, ids: [] as string[] };
      const isUnified = parts.some((part) => Boolean(part.canonicalProjectId));
      if (parts.length !== parts[0].partCount || parts.some((part) => isUnified
        ? !part.learningReadyAt || part.tasks.length === 0
        : part.status !== "ready")) return { status: "not_ready" as const, ids: [] as string[] };
      const changed = await tx.aiStudyProject.updateMany({
        where: {
          partGroupId: groupId, partCount: { gt: 1 }, deletedAt: null,
          ...(isUnified
            ? { learningReadyAt: { not: null }, tasks: { some: { type: "generate_cards" as const, status: "succeeded" as const } } }
            : { status: "ready" as const })
        },
        data: { visibility: "public" }
      });
      if (changed.count !== parts.length) throw new Error("分部状态已变化，请刷新后重试。");
      return { status: "ok" as const, ids: parts.map((part) => part.id) };
    });
    if (result.status === "unavailable") redirect(withAdminProjectMessage(returnTo, "error", "project-unavailable"));
    if (result.status === "not_ready") redirect(withAdminProjectMessage(returnTo, "error", "publish-requires-ready"));
    result.ids.forEach(revalidateAdminAiStudyProject);
    redirect(withAdminProjectMessage(returnTo, "notice", "published"));
  }
  const project = await prisma.aiStudyProject.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      status: true,
      deletedAt: true,
      partGroupId: true,
      partCount: true
    }
  });

  if (!project || project.deletedAt) {
    redirect(withAdminProjectMessage(returnTo, "error", "project-unavailable"));
  }
  if (project.partGroupId && (project.partCount ?? 0) > 1) {
    redirect(withAdminProjectMessage(returnTo, "error", "group-managed"));
  }
  if (project.status !== "ready") {
    redirect(withAdminProjectMessage(returnTo, "error", "publish-requires-ready"));
  }

  await prisma.aiStudyProject.update({
    where: { id: project.id },
    data: { visibility: "public" }
  });

  revalidateAdminAiStudyProject(project.id);
  redirect(withAdminProjectMessage(returnTo, "notice", "published"));
}

export async function privatizeAiStudyProject(formData: FormData) {
  await requireAdmin();
  const projectId = String(formData.get("projectId") || "");
  const groupId = String(formData.get("groupId") || "");
  const returnTo = getReturnTo(formData);
  if (groupId) {
    const parts = await prisma.aiStudyProject.findMany({
      where: { partGroupId: groupId, partCount: { gt: 1 }, deletedAt: null }, select: { id: true }
    });
    if (parts.length === 0) redirect(withAdminProjectMessage(returnTo, "error", "project-unavailable"));
    await prisma.aiStudyProject.updateMany({
      where: { partGroupId: groupId, partCount: { gt: 1 }, deletedAt: null }, data: { visibility: "private" }
    });
    parts.forEach((part) => revalidateAdminAiStudyProject(part.id));
    redirect(withAdminProjectMessage(returnTo, "notice", "privatized"));
  }
  const project = await prisma.aiStudyProject.findUnique({
    where: { id: projectId }, select: { partGroupId: true, partCount: true }
  });
  if (project?.partGroupId && (project.partCount ?? 0) > 1) {
    redirect(withAdminProjectMessage(returnTo, "error", "group-managed"));
  }
  const result = await prisma.aiStudyProject.updateMany({
    where: {
      id: projectId,
      deletedAt: null
    },
    data: {
      visibility: "private"
    }
  });

  if (result.count === 0) {
    redirect(withAdminProjectMessage(returnTo, "error", "project-unavailable"));
  }

  revalidateAdminAiStudyProject(projectId);
  redirect(withAdminProjectMessage(returnTo, "notice", "privatized"));
}

export async function deleteAiStudyProjectAsAdmin(formData: FormData) {
  await requireAdmin();
  const projectId = String(formData.get("projectId") || "");
  const groupId = String(formData.get("groupId") || "");
  const returnTo = getReturnTo(formData);
  if (groupId) {
    const parts = await prisma.aiStudyProject.findMany({
      where: { partGroupId: groupId, partCount: { gt: 1 } }, select: { id: true }
    });
    if (parts.length === 0) redirect(withAdminProjectMessage(returnTo, "error", "project-unavailable"));
    await prisma.aiStudyProject.deleteMany({ where: { partGroupId: groupId, partCount: { gt: 1 } } });
    await Promise.all(parts.map((part) => clearAiStudyProgressCache(part.id)));
    parts.forEach((part) => revalidateAdminAiStudyProject(part.id));
    redirect(withAdminProjectMessage(returnTo, "notice", "deleted"));
  }
  const project = await prisma.aiStudyProject.findUnique({
    where: { id: projectId }, select: { partGroupId: true, partCount: true }
  });
  if (project?.partGroupId && (project.partCount ?? 0) > 1) {
    redirect(withAdminProjectMessage(returnTo, "error", "group-managed"));
  }
  const result = await prisma.aiStudyProject.deleteMany({
    where: {
      id: projectId
    }
  });

  if (result.count === 0) {
    redirect(withAdminProjectMessage(returnTo, "error", "project-unavailable"));
  }

  await clearAiStudyProgressCache(projectId);
  revalidateAdminAiStudyProject(projectId);
  const deleteReturnTo = returnTo.startsWith(`/admin/ai-study-projects/${projectId}`) ? "/admin/ai-study-projects" : returnTo;
  redirect(withAdminProjectMessage(deleteReturnTo, "notice", "deleted"));
}

function getReturnTo(formData: FormData) {
  const returnTo = String(formData.get("returnTo") || "").trim();
  return returnTo.startsWith("/admin/ai-study-projects") ? returnTo : "/admin/ai-study-projects";
}

function withAdminProjectMessage(path: string, key: "notice" | "error", value: string) {
  const [pathname, rawQuery = ""] = path.split("?");
  const params = new URLSearchParams(rawQuery);
  params.delete("notice");
  params.delete("error");
  params.set(key, value);
  return `${pathname}?${params.toString()}`;
}

function revalidateAdminAiStudyProject(projectId: string) {
  revalidatePath("/admin/ai-study-projects");
  revalidatePath(`/admin/ai-study-projects/${projectId}`);
  revalidatePath("/study-buddy");
}
