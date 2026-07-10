import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isDefaultAvatarSrc } from "@/lib/default-avatars";
import { prisma } from "@/lib/prisma";

const avatarMaxBytes = 800 * 1024;
const allowedAvatarTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "请先登录后再更新头像。" }, { status: 401 });
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: "头像提交数据无效。" }, { status: 400 });
  }

  const uploadedAvatar = await readUploadedAvatar(formData.get("avatarImage"));
  if ("error" in uploadedAvatar) {
    return NextResponse.json({ error: uploadedAvatar.error }, { status: uploadedAvatar.status });
  }

  const presetAvatar = uploadedAvatar.avatarImage ? { avatarImage: null } : readPresetAvatar(formData.get("presetAvatarImage"));
  if ("error" in presetAvatar) {
    return NextResponse.json({ error: presetAvatar.error }, { status: presetAvatar.status });
  }

  const avatarImage = uploadedAvatar.avatarImage || presetAvatar.avatarImage;
  if (!avatarImage) {
    return NextResponse.json({ error: "请选择要保存的头像。" }, { status: 400 });
  }

  await prisma.studentProfile.upsert({
    where: { userId: user.id },
    update: { avatarImage },
    create: {
      userId: user.id,
      nickname: user.username,
      avatarImage
    }
  });

  revalidatePath("/me");
  revalidatePath(`/students/${user.id}`);

  return NextResponse.json({ avatarImage });
}

async function readUploadedAvatar(value: FormDataEntryValue | null): Promise<{ avatarImage: string | null } | { error: string; status: number }> {
  if (!(value instanceof File) || value.size === 0) {
    return { avatarImage: null };
  }

  if (value.size > avatarMaxBytes) {
    return { error: "上传失败，大小不超过 800KB", status: 400 };
  }

  if (!allowedAvatarTypes.has(value.type)) {
    return { error: "上传失败，仅支持 JPG、PNG、WebP", status: 400 };
  }

  const bytes = Buffer.from(await value.arrayBuffer());
  return { avatarImage: `data:${value.type};base64,${bytes.toString("base64")}` };
}

function readPresetAvatar(value: FormDataEntryValue | null): { avatarImage: string | null } | { error: string; status: number } {
  const avatarImage = String(value || "").trim();
  if (!avatarImage) {
    return { avatarImage: null };
  }

  if (!isDefaultAvatarSrc(avatarImage)) {
    return { error: "上传失败，仅支持系统头像库中的头像。", status: 400 };
  }

  return { avatarImage };
}
