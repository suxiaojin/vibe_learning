"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { clearAiStudyProgressCache } from "@/lib/ai-study-progress-cache";
import { prisma } from "@/lib/prisma";

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
