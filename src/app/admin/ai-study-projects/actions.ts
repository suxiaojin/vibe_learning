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
  const result = kind === "ai"
    ? await prisma.aiStudyProject.updateMany({
      where: { id, deletedAt: null },
      data: { diamondPrice }
    })
    : await prisma.officialStudyMaterial.updateMany({
      where: { id, deletedAt: null },
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
  const returnTo = getReturnTo(formData);
  const project = await prisma.aiStudyProject.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      status: true,
      deletedAt: true
    }
  });

  if (!project || project.deletedAt) {
    redirect(withAdminProjectMessage(returnTo, "error", "project-unavailable"));
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
  const returnTo = getReturnTo(formData);
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
  const returnTo = getReturnTo(formData);
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
