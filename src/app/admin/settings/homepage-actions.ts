"use server";

import sharp from "sharp";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { homepageImageSlots, homepageTextGroups, type HomepageImageSlot, type HomepageText } from "@/lib/homepage-settings";
import { prisma } from "@/lib/prisma";

const settingsPath = "/admin/settings?tab=homepage";
const maxUploadBytes = 5 * 1024 * 1024;
const maxSavedBytes = 1024 * 1024;

function imageSlot(value: FormDataEntryValue | null): HomepageImageSlot | null {
  return typeof value === "string" && homepageImageSlots.includes(value as HomepageImageSlot)
    ? value as HomepageImageSlot
    : null;
}

export async function saveHomepageText(formData: FormData) {
  await requireAdmin();
  const content = {} as HomepageText;
  for (const field of homepageTextGroups.flatMap((group) => group.fields)) {
    const raw = formData.get(field.key);
    if (typeof raw !== "string") {
      redirect(`${settingsPath}&error=homepage-text-invalid`);
    }
    const value = raw.trim();
    const maxLength = field.maxLength ?? (field.multiline ? 240 : 80);
    if (!value || value.length > maxLength) {
      redirect(`${settingsPath}&error=homepage-text-invalid`);
    }
    content[field.key] = value;
  }

  await prisma.systemSetting.upsert({
    where: { id: "default" },
    update: { homepageContent: content },
    create: { id: "default", homepageContent: content }
  });
  revalidatePath("/");
  revalidatePath("/admin/settings");
  redirect(`${settingsPath}&notice=homepage-text-saved`);
}

export async function uploadHomepageImage(formData: FormData) {
  await requireAdmin();
  const slot = imageSlot(formData.get("slot"));
  if (!slot) redirect(`${settingsPath}&error=homepage-image-invalid`);
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) {
    redirect(`${settingsPath}&error=homepage-image-required`);
  }
  if (file.size > maxUploadBytes) {
    redirect(`${settingsPath}&error=homepage-image-too-large`);
  }

  let body: Buffer;
  try {
    const input = Buffer.from(await file.arrayBuffer());
    const metadata = await sharp(input, { limitInputPixels: 24_000_000 }).metadata();
    if (!metadata.format || !["png", "jpeg", "webp"].includes(metadata.format)) {
      redirect(`${settingsPath}&error=homepage-image-invalid`);
    }
    body = await sharp(input, { limitInputPixels: 24_000_000 })
      .rotate()
      .resize({ width: 1600, height: 1200, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82, effort: 5 })
      .toBuffer();
    if (body.byteLength > maxSavedBytes) {
      redirect(`${settingsPath}&error=homepage-image-too-large`);
    }
  } catch (error) {
    // Next.js redirects throw; keep validation redirects intact.
    if (error && typeof error === "object" && "digest" in error) throw error;
    redirect(`${settingsPath}&error=homepage-image-invalid`);
  }

  await prisma.homepageImage.upsert({
    where: { slot },
    update: { body, contentType: "image/webp" },
    create: { slot, body, contentType: "image/webp" }
  });
  revalidatePath("/");
  revalidatePath("/admin/settings");
  redirect(`${settingsPath}&notice=homepage-image-saved`);
}

export async function restoreHomepageImage(formData: FormData) {
  await requireAdmin();
  const slot = imageSlot(formData.get("slot"));
  if (!slot) redirect(`${settingsPath}&error=homepage-image-invalid`);
  await prisma.homepageImage.deleteMany({ where: { slot } });
  revalidatePath("/");
  revalidatePath("/admin/settings");
  redirect(`${settingsPath}&notice=homepage-image-restored`);
}
