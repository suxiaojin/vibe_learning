"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { homepageImageSlots, homepageTextGroups, type HomepageImageSlot, type HomepageText } from "@/lib/homepage-settings";
import { prisma } from "@/lib/prisma";
import { HomepageMediaError, prepareHomepageMedia } from "@/lib/homepage-media";

const settingsPath = "/admin/settings?tab=homepage";

function imageSlot(value: FormDataEntryValue | null): HomepageImageSlot | null {
  return typeof value === "string" && homepageImageSlots.includes(value as HomepageImageSlot)
    ? value as HomepageImageSlot
    : null;
}

export async function saveHomepageText(formData: FormData) {
  await requireAdmin();
  const group = homepageTextGroups.find((item) => item.id === formData.get("group"));
  if (!group) redirect(`${settingsPath}&error=homepage-text-invalid`);

  const content: Partial<HomepageText> = {};
  for (const field of group.fields) {
    const raw = formData.get(field.key);
    if (typeof raw !== "string") {
      redirect(`${settingsPath}&error=homepage-text-invalid&openGroup=${group.id}`);
    }
    const value = raw.trim();
    const maxLength = field.maxLength ?? (field.multiline ? 240 : 80);
    if (!value || value.length > maxLength) {
      redirect(`${settingsPath}&error=homepage-text-invalid&openGroup=${group.id}`);
    }
    content[field.key] = value;
  }

  const patch = JSON.stringify(content);
  await prisma.$transaction(async (tx) => {
    await tx.systemSetting.upsert({
      where: { id: "default" },
      update: { updatedAt: new Date() },
      create: { id: "default" }
    });
    await tx.$executeRaw`
      UPDATE "system_settings"
      SET "homepageContent" = "homepageContent" || CAST(${patch} AS jsonb),
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = 'default'
    `;
  });
  revalidatePath("/");
  revalidatePath("/admin/settings");
  redirect(`${settingsPath}&notice=homepage-text-saved&openGroup=${group.id}`);
}

export async function uploadHomepageImage(formData: FormData) {
  await requireAdmin();
  const slot = imageSlot(formData.get("slot"));
  if (!slot) redirect(`${settingsPath}&error=homepage-image-invalid`);
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) {
    redirect(`${settingsPath}&error=homepage-media-required&openImage=${slot}`);
  }

  let media: Awaited<ReturnType<typeof prepareHomepageMedia>>;
  try {
    media = await prepareHomepageMedia(file);
  } catch (error) {
    if (!(error instanceof HomepageMediaError)) throw error;
    redirect(`${settingsPath}&error=${error.code}&openImage=${slot}`);
  }

  await prisma.homepageImage.upsert({
    where: { slot },
    update: media,
    create: { slot, ...media }
  });
  revalidatePath("/");
  revalidatePath("/admin/settings");
  redirect(`${settingsPath}&notice=homepage-media-saved&openImage=${slot}`);
}

export async function restoreHomepageImage(formData: FormData) {
  await requireAdmin();
  const slot = imageSlot(formData.get("slot"));
  if (!slot) redirect(`${settingsPath}&error=homepage-image-invalid`);
  await prisma.homepageImage.deleteMany({ where: { slot } });
  revalidatePath("/");
  revalidatePath("/admin/settings");
  redirect(`${settingsPath}&notice=homepage-image-restored&openImage=${slot}`);
}
