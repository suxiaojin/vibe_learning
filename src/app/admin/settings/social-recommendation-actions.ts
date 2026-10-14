"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const settingsPath = "/admin/settings?tab=admin";

function values(formData: FormData, key: string) {
  return formData.getAll(key).map((value) => typeof value === "string" ? value.trim() : "");
}

function invalid(): never {
  redirect(settingsPath + "&error=social-recommendations-invalid");
}

export async function saveSocialFollowRecommendationSettings(formData: FormData) {
  await requireAdmin();
  const targetUserIds = values(formData, "targetUserId");
  const provinces = values(formData, "province");
  const studySystems = values(formData, "studySystem");
  const majorIds = values(formData, "majorId");

  if (targetUserIds.length > 100 || provinces.length !== targetUserIds.length ||
      studySystems.length !== targetUserIds.length || majorIds.length !== targetUserIds.length) {
    invalid();
  }

  const rules = targetUserIds.flatMap((targetUserId, index) => {
    const province = provinces[index] || null;
    const studySystem = studySystems[index] || null;
    const majorId = majorIds[index] || null;
    if (!targetUserId) return province || studySystem || majorId ? [null] : [];
    return [{ targetUserId, province, studySystem, majorId }];
  });
  if (rules.some((rule) => rule === null)) invalid();

  const normalizedRules = rules as Array<{
    targetUserId: string;
    province: string | null;
    studySystem: string | null;
    majorId: string | null;
  }>;
  const targetIds = normalizedRules.map((rule) => rule.targetUserId);
  if (new Set(targetIds).size !== targetIds.length) invalid();

  const [students, regions, majors] = await Promise.all([
    targetIds.length
      ? prisma.user.findMany({ where: { id: { in: targetIds }, role: "student" }, select: { id: true } })
      : Promise.resolve([]),
    prisma.region.findMany({ select: { province: true, studySystem: true } }),
    prisma.major.findMany({ select: { id: true } })
  ]);
  if (students.length !== targetIds.length) invalid();

  const knownProvinces = new Set(regions.map((region) => region.province));
  const knownStudySystems = new Set(regions.map((region) => region.studySystem));
  const knownMajorIds = new Set(majors.map((major) => major.id));
  if (normalizedRules.some((rule) =>
    (rule.province !== null && !knownProvinces.has(rule.province)) ||
    (rule.studySystem !== null && !knownStudySystems.has(rule.studySystem)) ||
    (rule.majorId !== null && !knownMajorIds.has(rule.majorId))
  )) invalid();

  const jsonRules = JSON.parse(JSON.stringify(normalizedRules));
  await prisma.systemSetting.upsert({
    where: { id: "default" },
    update: { buddyFollowRecommendations: jsonRules },
    create: { id: "default", buddyFollowRecommendations: jsonRules }
  });
  revalidatePath("/admin/settings");
  revalidatePath("/buddy-circle");
  redirect(settingsPath + "&notice=social-recommendations-saved");
}
