"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function studentsMessagePath(formData: FormData, kind: "error" | "notice", message: string) {
  const raw = String(formData.get("returnTo") || "/admin/students");
  const params = raw.startsWith("/admin/students?")
    ? new URLSearchParams(raw.slice("/admin/students?".length))
    : new URLSearchParams();
  params.delete("error");
  params.delete("notice");
  params.set(kind, message);
  return `/admin/students?${params.toString()}`;
}

export async function updateStudentPlan(formData: FormData) {
  await requireAdmin();
  const studentId = String(formData.get("studentId") || "");
  const profileId = String(formData.get("profileId") || "");
  const previousRegionId = String(formData.get("previousRegionId") || "") || null;
  const previousSubjectId = String(formData.get("previousSubjectId") || "") || null;
  const previousMajorId = String(formData.get("previousMajorId") || "") || null;
  const regionId = String(formData.get("regionId") || "");
  const publicSubjectId = String(formData.get("publicSubjectId") || "");
  const majorId = String(formData.get("majorId") || "");
  if (!studentId || !regionId || !publicSubjectId || !majorId) {
    redirect(studentsMessagePath(formData, "error", "请选择完整的地区、公共课和专业"));
  }
  if (profileId && regionId === previousRegionId && publicSubjectId === previousSubjectId && majorId === previousMajorId) {
    redirect(studentsMessagePath(formData, "error", "学习方案没有变化"));
  }

  const error = await prisma.$transaction(async (tx) => {
    const [student, region, subject, major] = await Promise.all([
      tx.user.findFirst({ where: { id: studentId, role: "student" }, select: { id: true } }),
      tx.region.findFirst({ where: { id: regionId, status: "active" }, select: { id: true } }),
      tx.publicSubject.findFirst({ where: { id: publicSubjectId, status: "published", regions: { some: { regionId } } }, select: { id: true } }),
      tx.major.findFirst({ where: { id: majorId, status: "published", regions: { some: { regionId } } }, select: { id: true } })
    ]);
    if (!student) return "学生账号不存在";
    if (!region || !subject || !major) return "所选地区、公共课或专业已不可用，请刷新后重试";

    if (!profileId) {
      const created = await tx.studentProfile.createMany({ data: [{ userId: studentId }], skipDuplicates: true });
      if (created.count !== 1) return "学生资料已发生变化，请刷新后重试";
    }
    const profile = await tx.studentProfile.findUnique({ where: { userId: studentId }, select: { id: true, foundationPlanConfirmedAt: true } });
    if (!profile || (profileId && profile.id !== profileId)) return "学生资料已发生变化，请刷新后重试";
    const updated = await tx.studentProfile.updateMany({
      where: {
        id: profile.id, userId: studentId, regionId: previousRegionId,
        publicSubjectId: previousSubjectId, majorId: previousMajorId,
        foundationPlanConfirmedAt: profile.foundationPlanConfirmedAt,
        user: { role: "student" }
      },
      data: { regionId, publicSubjectId, majorId, foundationPlanConfirmedAt: profile.foundationPlanConfirmedAt || new Date() }
    });
    return updated.count === 1 ? null : "学生资料已发生变化，请刷新后重试";
  });
  if (error) redirect(studentsMessagePath(formData, "error", error));

  revalidatePath("/admin/students");
  revalidatePath(`/admin/students/${studentId}`);
  revalidatePath("/course-center");
  redirect(studentsMessagePath(formData, "notice", "学生学习方案已修改"));
}
