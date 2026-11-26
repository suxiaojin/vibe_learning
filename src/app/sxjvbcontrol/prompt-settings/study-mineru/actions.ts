"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { isStudyMineruConcurrency, saveStudyMineruSettings } from "@/lib/ai-study-mineru-settings";

const page = "/sxjvbcontrol/prompt-settings/study-mineru";

export async function saveStudyMineruAction(formData: FormData) {
  await requireAdmin();
  const provider = formData.get("provider");
  const token = String(formData.get("token") ?? "").trim();
  if ((provider !== "private" && provider !== "online") || token.length > 4096 || /[^\x21-\x7e]/.test(token)) {
    redirect(`${page}?error=mineru-invalid#study-mineru`);
  }
  const concurrency = {
    private: Number(formData.get("privateConcurrency")),
    online: Number(formData.get("onlineConcurrency"))
  };
  for (const service of ["private", "online"] as const) {
    if (!isStudyMineruConcurrency(concurrency[service])) {
      redirect(`${page}?error=mineru-invalid-${service}#mineru-${service}-title`);
    }
  }

  const onlineImageSupplementEnabled = formData.get("onlineImageSupplementEnabled") === "on";
  let saved: boolean;
  try {
    saved = await saveStudyMineruSettings(provider, token, concurrency, onlineImageSupplementEnabled);
  } catch (error) {
    console.error("Failed to save Study Buddy MinerU settings.", error);
    redirect(`${page}?error=mineru-save-failed#study-mineru`);
  }
  if (!saved) redirect(`${page}?error=mineru-key-required#study-mineru`);
  redirect(`${page}?notice=mineru-saved#study-mineru`);
}
