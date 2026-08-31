"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { isLearningPathThemeKey, type LearningPathThemeKey } from "@/lib/learning-path-theme";
import { prisma } from "@/lib/prisma";
import { systemSettingsDefaults, systemSettingsId } from "@/lib/system-settings";

export type LearningPathThemeFormState = {
  status: "idle" | "success" | "error";
  message: string;
  savedThemeKey?: LearningPathThemeKey;
};

export async function updateLearningPathThemeSettings(
  _previousState: LearningPathThemeFormState,
  formData: FormData
): Promise<LearningPathThemeFormState> {
  await requireAdmin();
  const themeKey = formData.get("learningPathTheme");
  if (!isLearningPathThemeKey(themeKey)) {
    return { status: "error", message: "请选择有效的闯关颜色。" };
  }

  try {
    await prisma.systemSetting.upsert({
      where: { id: systemSettingsId },
      update: { learningPathTheme: themeKey },
      create: { ...systemSettingsDefaults, learningPathTheme: themeKey }
    });
  } catch (error) {
    console.error("Failed to save learning path theme", error);
    return { status: "error", message: "闯关颜色保存失败，请稍后重试。" };
  }

  revalidatePath("/admin/settings");
  revalidatePath("/learn");
  revalidatePath("/learn/stages");
  revalidatePath("/learn/[id]/guide", "page");
  revalidatePath("/learn/[id]", "page");
  revalidatePath("/learn/[id]/result", "page");
  return {
    status: "success",
    savedThemeKey: themeKey,
    message: "闯关颜色已保存，学生刷新或重新进入闯关页后生效。"
  };
}
