import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { AvatarStorageError, deleteStoredAvatarByUrl, storeUploadedAvatar } from "@/lib/avatar-storage";
import { isDefaultAvatarSrc } from "@/lib/default-avatars";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "请先登录后再更新头像。" }, { status: 401 });
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: "头像提交数据无效。" }, { status: 400 });
  }

  const previousProfile = await prisma.studentProfile.findUnique({
    where: { userId: user.id },
    select: { avatarImage: true }
  });

  const uploadedFile = formData.get("avatarImage");
  let storedAvatar: Awaited<ReturnType<typeof storeUploadedAvatar>> | null = null;
  if (uploadedFile instanceof File && uploadedFile.size > 0) {
    try {
      storedAvatar = await storeUploadedAvatar(user.id, uploadedFile);
    } catch (error) {
      if (error instanceof AvatarStorageError) {
        const message = error.code === "too_large"
          ? "上传失败，大小不超过 800KB"
          : "上传失败，文件内容必须是真实的 JPG、PNG 或 WebP 图片";
        return NextResponse.json({ error: message }, { status: 400 });
      }
      throw error;
    }
  }

  const presetAvatar = storedAvatar ? { avatarImage: null } : readPresetAvatar(formData.get("presetAvatarImage"));
  if ("error" in presetAvatar) {
    return NextResponse.json({ error: presetAvatar.error }, { status: presetAvatar.status });
  }

  const avatarImage = storedAvatar?.url || presetAvatar.avatarImage;
  if (!avatarImage) {
    return NextResponse.json({ error: "请选择要保存的头像。" }, { status: 400 });
  }

  try {
    await prisma.studentProfile.upsert({
      where: { userId: user.id },
      update: { avatarImage },
      create: {
        userId: user.id,
        nickname: user.username,
        avatarImage
      }
    });
  } catch (error) {
    if (storedAvatar) {
      await deleteStoredAvatarByUrl(storedAvatar.url).catch(() => undefined);
    }
    throw error;
  }

  if (previousProfile?.avatarImage && previousProfile.avatarImage !== avatarImage) {
    await deleteStoredAvatarByUrl(previousProfile.avatarImage).catch((error) => {
      console.error("Failed to delete replaced avatar object", error);
    });
  }

  revalidatePath("/me");
  revalidatePath(`/students/${user.id}`);

  return NextResponse.json({ avatarImage });
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
