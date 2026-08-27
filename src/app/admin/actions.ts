"use server";

import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { extname } from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ContentStatus, Difficulty, QuestionType, RegionStatus, ShareCopyContext, SyllabusRequirement } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { getDiamondRuleDefinition, maxDiamondRuleAmount } from "@/lib/diamond-rules";
import { prisma } from "@/lib/prisma";
import type { QuestionBankOwnerType } from "@/lib/question-bank-catalog";
import { getBeijingDate } from "@/lib/rewards";
import {
  isQuestionBankChoiceQuestionType,
  isQuestionBankEditableQuestionType,
  isQuestionBankRichAnswerQuestionType,
  parseQuestionBankQuestionTypeConfig,
  type QuestionBankEditableQuestionType
} from "@/lib/question-bank-types";
import { isShareCopyContext } from "@/lib/share-copy";
import { normalizeStudyBuddyHeroEffect } from "@/lib/study-buddy-title-effects";
import { systemSettingsDefaults, systemSettingsId } from "@/lib/system-settings";

type QuestionOption = {
  key: string;
  text: string;
};

const optionKeys = ["A", "B", "C", "D"] as const;
const alphabetOptionKeys = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const loginHeroUploadDir = "uploads/system-settings";
const maxLoginHeroImageSize = 5 * 1024 * 1024;
const maxStudyBuddyHeroImageSize = 5 * 1024 * 1024;
const maxDiamondRechargeQrCodeSize = 2 * 1024 * 1024;
const maxProfileHomepageBackgroundImageSize = 2 * 1024 * 1024;
const imageMimeExtensions: Record<string, string> = {
  "image/gif": ".gif",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp"
};

function getStatus(formData: FormData) {
  return String(formData.get("status") || "draft") as ContentStatus;
}

function getShareCopyContext(formData: FormData) {
  const context = String(formData.get("context") || "");
  if (!isShareCopyContext(context)) {
    throw new Error("Invalid share copy context");
  }
  return context as ShareCopyContext;
}

function shareCopySettingsPath(context?: ShareCopyContext) {
  const query = new URLSearchParams({ tab: "share-copy" });
  if (context) {
    query.set("context", context);
  }
  query.set("notice", "share-copy-saved");
  return `/admin/settings?${query.toString()}`;
}

function diamondRuleSettingsPath(kind: "notice" | "error", value: string) {
  const query = new URLSearchParams({ tab: "diamonds", [kind]: value });
  return `/admin/settings?${query.toString()}`;
}

function adminConfigurationSettingsPath(kind: "notice" | "error", value: string) {
  const query = new URLSearchParams({ tab: "admin", [kind]: value });
  return `/admin/settings?${query.toString()}`;
}

function getSyllabusRequirement(formData: FormData) {
  const value = String(formData.get("requirement") || "");
  return value ? (value as SyllabusRequirement) : null;
}

function getRegionStatus(formData: FormData) {
  return String(formData.get("status") || "active") as RegionStatus;
}

function getRegionIds(formData: FormData) {
  return formData
    .getAll("regionIds")
    .map((item) => String(item).trim())
    .filter(Boolean);
}

async function nextRegionSortOrder() {
  const latest = await prisma.region.findFirst({
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true }
  });
  return (latest?.sortOrder ?? 0) + 1;
}

async function nextPublicSubjectSortOrder() {
  const latest = await prisma.publicSubject.findFirst({
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true }
  });
  return (latest?.sortOrder ?? 0) + 1;
}

async function nextMajorSortOrder() {
  const latest = await prisma.major.findFirst({
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true }
  });
  return (latest?.sortOrder ?? 0) + 1;
}

async function nextAdminModuleSortOrder() {
  const latest = await prisma.adminModule.findFirst({
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true }
  });
  return (latest?.sortOrder ?? 0) + 1;
}

async function nextQuestionBankOwnerSortOrder() {
  const [latestSubject, latestMajor] = await Promise.all([
    prisma.publicSubject.findFirst({
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true }
    }),
    prisma.major.findFirst({
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true }
    })
  ]);
  return Math.max(latestSubject?.sortOrder ?? 0, latestMajor?.sortOrder ?? 0) + 1;
}

async function nextMajorCourseSortOrder(regionId: string, majorId: string) {
  const latest = await prisma.learningCourse.findFirst({
    where: { regionId, majorId, courseType: "major" },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true }
  });
  return (latest?.sortOrder ?? 0) + 1;
}

async function nextPublicSubjectCourseSortOrder(regionId: string, publicSubjectId: string) {
  const latest = await prisma.learningCourse.findFirst({
    where: { regionId, publicSubjectId, courseType: "public_subject" },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true }
  });
  return (latest?.sortOrder ?? 0) + 1;
}

async function nextSyllabusItemSortOrder(courseId: string, parentId: string | null) {
  const latest = await prisma.syllabusItem.findFirst({
    where: { courseId, parentId, checkpointScope: null },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true }
  });
  return (latest?.sortOrder ?? 0) + 1;
}

async function nextSyllabusItemCode(courseId: string, parentId: string | null) {
  const [parent, siblings] = await Promise.all([
    parentId
      ? prisma.syllabusItem.findFirstOrThrow({
          where: { id: parentId, courseId, checkpointScope: null },
          select: { code: true }
        })
      : Promise.resolve(null),
    prisma.syllabusItem.findMany({
      where: { courseId, parentId, checkpointScope: null },
      select: { code: true, sortOrder: true }
    })
  ]);
  const maxIndex = siblings.reduce((max, item) => {
    const lastSegment = item.code?.split(".").at(-1);
    const value = Number(lastSegment || item.sortOrder || 0);
    return Number.isFinite(value) ? Math.max(max, value) : max;
  }, 0);
  const nextIndex = maxIndex + 1;
  return parent?.code ? `${parent.code}.${nextIndex}` : String(nextIndex);
}

async function nextCourseChapterSortOrder(courseId: string) {
  const latest = await prisma.chapter.findFirst({
    where: { courseId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true }
  });
  return (latest?.sortOrder ?? 0) + 1;
}

async function nextKnowledgePointSortOrder(chapterId: string, syllabusItemId?: string | null) {
  const latest = await prisma.knowledgePoint.findFirst({
    where: syllabusItemId ? { syllabusItemId } : { chapterId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true }
  });
  return (latest?.sortOrder ?? 0) + 1;
}

async function nextExamPaperQuestionSortOrder(paperId: string) {
  const latest = await prisma.examPaperQuestion.findFirst({
    where: { paperId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true }
  });
  return (latest?.sortOrder ?? 0) + 1;
}

async function deleteMajorWithContent(majorId: string) {
  await prisma.$transaction(async (tx) => {
    await tx.learningCourse.deleteMany({
      where: {
        majorId,
        courseType: "major"
      }
    });
    await tx.major.delete({
      where: { id: majorId }
    });
  });
}

function buildRegionName(province: string, studySystem: string) {
  return `${province}${studySystem}`.trim();
}

function buildModuleKey(label: string) {
  const base = label.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-").replace(/^-+|-+$/g, "");
  return `${base || "module"}-${Date.now().toString(36)}`;
}

function getAdminStudentsReturnTo(formData: FormData) {
  const returnTo = String(formData.get("returnTo") || "/admin/students");
  return returnTo.startsWith("/admin/students") ? returnTo : "/admin/students";
}

function appendAdminStudentsMessage(path: string, key: "notice" | "error", message: string) {
  const [base, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.set(key, message);
  return `${base}?${params.toString()}`;
}

function getRequiredSettingText(formData: FormData, key: keyof typeof systemSettingsDefaults) {
  const value = String(formData.get(key) || "").trim();
  return value || String(systemSettingsDefaults[key]);
}

function getStudyBuddyHeroEffect(formData: FormData) {
  const value = String(formData.get("studyBuddyHeroEffect") || "").trim();
  return normalizeStudyBuddyHeroEffect(value);
}

function getStudyBuddyHeroTypeSpeedMs(formData: FormData) {
  const value = Number(formData.get("studyBuddyHeroTypeSpeedMs"));
  if (!Number.isFinite(value)) {
    return systemSettingsDefaults.studyBuddyHeroTypeSpeedMs;
  }
  return Math.min(300, Math.max(40, Math.round(value)));
}

async function saveLoginHeroImage(file: File) {
  if (!imageMimeExtensions[file.type]) {
    redirect("/admin/settings?error=invalid-image-type");
  }

  if (file.size > maxLoginHeroImageSize) {
    redirect("/admin/settings?error=image-too-large");
  }

  const extension = imageMimeExtensions[file.type] || extname(file.name).toLowerCase() || ".png";
  const fileName = `login-hero-${Date.now()}-${randomUUID().slice(0, 8)}${extension}`;
  const publicDir = `${process.cwd()}/public/${loginHeroUploadDir}`;
  await mkdir(publicDir, { recursive: true });
  await writeFile(`${publicDir}/${fileName}`, Buffer.from(await file.arrayBuffer()));
  return `/${loginHeroUploadDir}/${fileName}`;
}

async function saveStudyBuddyHeroImage(file: File) {
  if (file.type !== "image/webp") {
    redirect("/admin/settings?tab=study-buddy&error=invalid-study-buddy-hero-image-type");
  }

  if (file.size > maxStudyBuddyHeroImageSize) {
    redirect("/admin/settings?tab=study-buddy&error=study-buddy-hero-image-too-large");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  return `data:image/webp;base64,${buffer.toString("base64")}`;
}

async function saveDiamondRechargeQrCode(file: File) {
  const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
  if (!allowedTypes.has(file.type)) {
    redirect(adminConfigurationSettingsPath("error", "invalid-diamond-recharge-qr-type"));
  }

  if (file.size > maxDiamondRechargeQrCodeSize) {
    redirect(adminConfigurationSettingsPath("error", "diamond-recharge-qr-too-large"));
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  return `data:${file.type};base64,${buffer.toString("base64")}`;
}

async function saveProfileHomepageBackgroundImage(file: File) {
  const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
  if (!allowedTypes.has(file.type)) {
    redirect(adminConfigurationSettingsPath("error", "invalid-profile-homepage-background-type"));
  }

  if (file.size > maxProfileHomepageBackgroundImageSize) {
    redirect(adminConfigurationSettingsPath("error", "profile-homepage-background-too-large"));
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  return `data:${file.type};base64,${buffer.toString("base64")}`;
}

async function updateSystemSettingsPatch(data: Partial<typeof systemSettingsDefaults>) {
  await prisma.systemSetting.upsert({
    where: { id: systemSettingsId },
    update: data,
    create: {
      ...systemSettingsDefaults,
      ...data,
      id: systemSettingsId
    }
  });
}

async function getCurrentStudyBuddyHeroImageUrl() {
  const settings = await prisma.systemSetting.findUnique({
    where: { id: systemSettingsId },
    select: { studyBuddyHeroImageUrl: true }
  });

  return settings?.studyBuddyHeroImageUrl || systemSettingsDefaults.studyBuddyHeroImageUrl;
}

function getQuestionType(formData: FormData) {
  return String(formData.get("type") || "single_choice") as QuestionType;
}

function buildQuestionOptions(formData: FormData): QuestionOption[] {
  return optionKeys
    .map((key) => ({
      key,
      text: String(formData.get(`option${key}`) || "").trim()
    }))
    .filter((option) => option.text.length > 0);
}

function buildQuestionAnswer(formData: FormData, type: QuestionType) {
  const selected = formData
    .getAll("answer")
    .map((item) => String(item).trim())
    .filter(Boolean);

  if (selected.length === 0) {
    return ["A"];
  }

  return type === "multiple_choice" ? selected.sort() : [selected[0]];
}

export async function createRegion(formData: FormData) {
  await requireAdmin();
  const province = String(formData.get("province") || "").trim();
  const studySystem = String(formData.get("studySystem") || "").trim();
  await prisma.region.create({
    data: {
      name: buildRegionName(province, studySystem),
      province,
      studySystem,
      description: String(formData.get("description") || "").trim() || null,
      sortOrder: await nextRegionSortOrder(),
      status: getRegionStatus(formData)
    }
  });
  revalidatePath("/admin/regions");
  redirect("/admin/regions");
}

export async function updateRegion(formData: FormData) {
  await requireAdmin();
  const province = String(formData.get("province") || "").trim();
  const studySystem = String(formData.get("studySystem") || "").trim();
  await prisma.region.update({
    where: { id: String(formData.get("id")) },
    data: {
      name: buildRegionName(province, studySystem),
      province,
      studySystem,
      description: String(formData.get("description") || "").trim() || null,
      status: getRegionStatus(formData)
    }
  });
  revalidatePath("/admin/regions");
  redirect("/admin/regions");
}

export async function toggleRegionStatus(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const region = await prisma.region.findUniqueOrThrow({
    where: { id },
    select: { status: true }
  });
  await prisma.region.update({
    where: { id },
    data: { status: region.status === "active" ? "inactive" : "active" }
  });
  revalidatePath("/admin/regions");
}

export async function createAdminModule(formData: FormData) {
  await requireAdmin();
  const label = String(formData.get("label") || "").trim();
  const sortOrderValue = String(formData.get("sortOrder") || "").trim();
  await prisma.adminModule.create({
    data: {
      key: buildModuleKey(label),
      label,
      href: String(formData.get("href") || "").trim() || "/admin/regions",
      icon: String(formData.get("icon") || "settings").trim(),
      status: getStatus(formData),
      sortOrder: sortOrderValue ? Number(sortOrderValue) : await nextAdminModuleSortOrder()
    }
  });
  revalidatePath("/admin/module-config");
  revalidatePath("/admin", "layout");
}

export async function updateAdminModule(formData: FormData) {
  await requireAdmin();
  await prisma.adminModule.update({
    where: { id: String(formData.get("id") || "") },
    data: {
      label: String(formData.get("label") || "").trim(),
      href: String(formData.get("href") || "").trim() || "/admin/regions",
      icon: String(formData.get("icon") || "settings").trim(),
      status: getStatus(formData),
      sortOrder: Number(formData.get("sortOrder") || 0)
    }
  });
  revalidatePath("/admin/module-config");
  revalidatePath("/admin", "layout");
}

export async function updateSystemSettings(formData: FormData) {
  await requireAdmin();
  let loginHeroImageUrl = getRequiredSettingText(formData, "loginHeroImageUrl");
  const loginHeroImageFile = formData.get("loginHeroImageFile");

  if (loginHeroImageFile instanceof File && loginHeroImageFile.size > 0) {
    loginHeroImageUrl = await saveLoginHeroImage(loginHeroImageFile);
  }

  const data = {
    loginHeroImageUrl,
    loginMarketingIcon: getRequiredSettingText(formData, "loginMarketingIcon"),
    loginMarketingTitle: getRequiredSettingText(formData, "loginMarketingTitle"),
    loginMarketingDescription: getRequiredSettingText(formData, "loginMarketingDescription"),
    loginWelcomeTitle: getRequiredSettingText(formData, "loginWelcomeTitle"),
    userAgreementContent: getRequiredSettingText(formData, "userAgreementContent"),
    privacyPolicyContent: getRequiredSettingText(formData, "privacyPolicyContent"),
    platformAgreementContent: getRequiredSettingText(formData, "platformAgreementContent"),
    faqContent: getRequiredSettingText(formData, "faqContent"),
    customerServiceEmail: getRequiredSettingText(formData, "customerServiceEmail")
  };

  await updateSystemSettingsPatch(data);

  revalidatePath("/admin/settings");
  revalidatePath("/login");
  revalidatePath("/register");
  revalidatePath("/user-agreement");
  revalidatePath("/privacy-policy");
  revalidatePath("/platform-agreement");
  revalidatePath("/help");
  revalidatePath("/forgot-password");
  revalidatePath("/study-buddy");
  redirect("/admin/settings?notice=saved");
}

export async function updateStudyBuddyHeroImageSettings(formData: FormData) {
  await requireAdmin();
  let studyBuddyHeroImageUrl = await getCurrentStudyBuddyHeroImageUrl();
  const studyBuddyHeroImageAddress = String(formData.get("studyBuddyHeroImageAddress") || "").trim();
  const studyBuddyHeroImageFile = formData.get("studyBuddyHeroImageFile");

  if (studyBuddyHeroImageAddress) {
    studyBuddyHeroImageUrl = studyBuddyHeroImageAddress;
  }

  if (studyBuddyHeroImageFile instanceof File && studyBuddyHeroImageFile.size > 0) {
    studyBuddyHeroImageUrl = await saveStudyBuddyHeroImage(studyBuddyHeroImageFile);
  }

  await updateSystemSettingsPatch({ studyBuddyHeroImageUrl });
  revalidatePath("/admin/settings");
  revalidatePath("/study-buddy");
  redirect("/admin/settings?tab=study-buddy&notice=study-buddy-hero-image-saved");
}

export async function updateDiamondRechargeQrSettings(formData: FormData) {
  await requireAdmin();
  const diamondRechargeQrCodeFile = formData.get("diamondRechargeQrCodeFile");

  if (!(diamondRechargeQrCodeFile instanceof File) || diamondRechargeQrCodeFile.size === 0) {
    redirect(adminConfigurationSettingsPath("error", "diamond-recharge-qr-required"));
  }

  const diamondRechargeQrCodeUrl = await saveDiamondRechargeQrCode(diamondRechargeQrCodeFile);
  await updateSystemSettingsPatch({ diamondRechargeQrCodeUrl });

  revalidatePath("/admin/settings");
  revalidatePath("/me");
  redirect(adminConfigurationSettingsPath("notice", "diamond-recharge-qr-saved"));
}

export async function updateProfileHomepageBackgroundSettings(formData: FormData) {
  await requireAdmin();
  const profileHomepageBackgroundFile = formData.get("profileHomepageBackgroundFile");

  if (!(profileHomepageBackgroundFile instanceof File) || profileHomepageBackgroundFile.size === 0) {
    redirect(adminConfigurationSettingsPath("error", "profile-homepage-background-required"));
  }

  const profileHomepageBackgroundImageUrl = await saveProfileHomepageBackgroundImage(profileHomepageBackgroundFile);
  const profileHomepageBackgroundUpdatedAt = new Date();
  await prisma.systemSetting.upsert({
    where: { id: systemSettingsId },
    update: { profileHomepageBackgroundImageUrl, profileHomepageBackgroundUpdatedAt },
    create: {
      ...systemSettingsDefaults,
      profileHomepageBackgroundImageUrl,
      profileHomepageBackgroundUpdatedAt,
      id: systemSettingsId
    }
  });

  revalidatePath("/admin/settings");
  revalidatePath("/me");
  revalidatePath("/students/[userId]", "page");
  redirect(adminConfigurationSettingsPath("notice", "profile-homepage-background-saved"));
}

export async function updateStudyBuddyHeroTitleSettings(formData: FormData) {
  await requireAdmin();
  await updateSystemSettingsPatch({
    studyBuddyHeroTitle: getRequiredSettingText(formData, "studyBuddyHeroTitle")
  });
  revalidatePath("/admin/settings");
  revalidatePath("/study-buddy");
  redirect("/admin/settings?tab=study-buddy&notice=study-buddy-hero-title-saved");
}

export async function updateStudyBuddyHeroEffectSettings(formData: FormData) {
  await requireAdmin();
  await updateSystemSettingsPatch({
    studyBuddyHeroEffect: getStudyBuddyHeroEffect(formData),
    studyBuddyHeroTypeSpeedMs: getStudyBuddyHeroTypeSpeedMs(formData)
  });
  revalidatePath("/admin/settings");
  revalidatePath("/study-buddy");
  redirect("/admin/settings?tab=study-buddy&notice=study-buddy-hero-effect-saved");
}

export async function updateDiamondRuleSettings(formData: FormData) {
  const admin = await requireAdmin();
  const key = String(formData.get("key") || "").trim();
  const definition = getDiamondRuleDefinition(key);
  if (!definition) {
    redirect(diamondRuleSettingsPath("error", "invalid-diamond-rule"));
  }

  const amountValue = String(formData.get("amount") || "").trim();
  const amount = Number(amountValue);
  if (!/^\d+$/.test(amountValue) || !Number.isSafeInteger(amount) || amount < 1 || amount > maxDiamondRuleAmount) {
    redirect(diamondRuleSettingsPath("error", "invalid-diamond-rule-amount"));
  }

  const enabled = formData.get("enabled") === "on";
  await prisma.diamondRuleConfig.upsert({
    where: { key: definition.key },
    update: {
      amount,
      enabled,
      version: { increment: 1 },
      updatedById: admin.id
    },
    create: {
      key: definition.key,
      direction: definition.direction,
      amount,
      enabled,
      version: 2,
      updatedById: admin.id
    }
  });

  revalidatePath("/admin/settings");
  redirect(diamondRuleSettingsPath("notice", "diamond-rule-saved"));
}

export async function createShareCopyStyle(formData: FormData) {
  await requireAdmin();
  const context = getShareCopyContext(formData);
  const label = String(formData.get("label") || "").trim();
  if (!label) {
    redirect(shareCopySettingsPath(context));
  }
  await prisma.shareCopyStyle.create({
    data: {
      context,
      label,
      sortOrder: Number(formData.get("sortOrder") || 0),
      status: getStatus(formData)
    }
  });
  revalidatePath("/admin/settings");
  redirect(shareCopySettingsPath(context));
}

export async function updateShareCopyStyle(formData: FormData) {
  await requireAdmin();
  const context = getShareCopyContext(formData);
  await prisma.shareCopyStyle.update({
    where: { id: String(formData.get("styleId") || "") },
    data: {
      label: String(formData.get("label") || "").trim(),
      sortOrder: Number(formData.get("sortOrder") || 0),
      status: getStatus(formData)
    }
  });
  revalidatePath("/admin/settings");
  redirect(shareCopySettingsPath(context));
}

export async function deleteShareCopyStyle(formData: FormData) {
  await requireAdmin();
  const context = getShareCopyContext(formData);
  await prisma.shareCopyStyle.delete({
    where: { id: String(formData.get("styleId") || "") }
  });
  revalidatePath("/admin/settings");
  redirect(shareCopySettingsPath(context));
}

export async function createShareCopyPhrase(formData: FormData) {
  await requireAdmin();
  const context = getShareCopyContext(formData);
  const content = String(formData.get("content") || "").trim();
  if (!content) {
    redirect(shareCopySettingsPath(context));
  }
  await prisma.shareCopyPhrase.create({
    data: {
      styleId: String(formData.get("styleId") || ""),
      content,
      sortOrder: Number(formData.get("sortOrder") || 0),
      status: getStatus(formData)
    }
  });
  revalidatePath("/admin/settings");
  redirect(shareCopySettingsPath(context));
}

export async function updateShareCopyPhrase(formData: FormData) {
  await requireAdmin();
  const context = getShareCopyContext(formData);
  await prisma.shareCopyPhrase.update({
    where: { id: String(formData.get("phraseId") || "") },
    data: {
      content: String(formData.get("content") || "").trim(),
      sortOrder: Number(formData.get("sortOrder") || 0),
      status: getStatus(formData)
    }
  });
  revalidatePath("/admin/settings");
  redirect(shareCopySettingsPath(context));
}

export async function deleteShareCopyPhrase(formData: FormData) {
  await requireAdmin();
  const context = getShareCopyContext(formData);
  await prisma.shareCopyPhrase.delete({
    where: { id: String(formData.get("phraseId") || "") }
  });
  revalidatePath("/admin/settings");
  redirect(shareCopySettingsPath(context));
}

export async function toggleStudentAccountStatus(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  const returnTo = getAdminStudentsReturnTo(formData);
  const student = await prisma.user.findFirstOrThrow({
    where: { id, role: "student" },
    select: { status: true }
  });
  const disabledReason = String(formData.get("disabledReason") || "").trim() || "后台手动禁用";
  const nextStatus = student.status === "disabled" ? "active" : "disabled";

  await prisma.user.update({
    where: { id },
    data: {
      status: nextStatus,
      disabledAt: nextStatus === "disabled" ? new Date() : null,
      disabledReason: nextStatus === "disabled" ? disabledReason : null
    }
  });

  revalidatePath("/admin/students");
  revalidatePath(`/admin/students/${id}`);
  redirect(appendAdminStudentsMessage(returnTo, "notice", nextStatus === "disabled" ? "学生账号已禁用" : "学生账号已启用"));
}

export async function resetStudentPassword(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") || "");
  const returnTo = getAdminStudentsReturnTo(formData);
  const password = String(formData.get("password") || "");

  if (password.length < 6) {
    redirect(appendAdminStudentsMessage(returnTo, "error", "新密码至少需要 6 位"));
  }

  await prisma.user.findFirstOrThrow({
    where: { id, role: "student" },
    select: { id: true }
  });
  await prisma.$transaction([
    prisma.user.update({
      where: { id },
      data: { passwordHash: await bcrypt.hash(password, 12) }
    }),
    prisma.passwordChangeLog.create({
      data: {
        userId: id,
        actorUserId: admin.id,
        source: "admin_reset",
        note: "后台重置密码"
      }
    })
  ]);

  revalidatePath("/admin/students");
  revalidatePath(`/admin/students/${id}`);
  redirect(appendAdminStudentsMessage(returnTo, "notice", "学生密码已重置"));
}

export async function addStudentDiamonds(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") || "");
  const returnTo = getAdminStudentsReturnTo(formData);
  const amount = Number(formData.get("amount") || 0);
  const note = String(formData.get("note") || "").trim() || "后台手动添加钻石";

  if (!Number.isInteger(amount) || amount <= 0) {
    redirect(appendAdminStudentsMessage(returnTo, "error", "钻石数量必须是大于 0 的整数"));
  }

  await prisma.user.findFirstOrThrow({
    where: { id, role: "student" },
    select: { id: true }
  });

  await prisma.$transaction(async (tx) => {
    const account = await tx.diamondAccount.upsert({
      where: { userId: id },
      update: {},
      create: { userId: id, balance: 0 }
    });
    const updatedAccount = await tx.diamondAccount.update({
      where: { userId: id },
      data: { balance: { increment: amount } },
      select: { balance: true }
    });
    await tx.diamondTransaction.create({
      data: {
        userId: id,
        accountId: account.id,
        type: "admin_adjust",
        amount,
        balanceAfter: updatedAccount.balance,
        occurredOn: getBeijingDate(),
        note,
        metadata: {
          actorUserId: admin.id,
          actorUsername: admin.username,
          source: "admin_student_detail"
        }
      }
    });
  });

  revalidatePath("/admin/students");
  revalidatePath(`/admin/students/${id}`);
  revalidatePath("/me");
  redirect(appendAdminStudentsMessage(returnTo, "notice", "钻石已添加"));
}

export async function updateStudentAdminRemark(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  const returnTo = getAdminStudentsReturnTo(formData);
  const adminRemark = String(formData.get("adminRemark") || "").trim().slice(0, 1000) || null;

  await prisma.user.findFirstOrThrow({
    where: { id, role: "student" },
    select: { id: true }
  });
  await prisma.user.update({
    where: { id },
    data: { adminRemark }
  });

  revalidatePath("/admin/students");
  revalidatePath(`/admin/students/${id}`);
  redirect(appendAdminStudentsMessage(returnTo, "notice", "后台备注已保存"));
}

export async function deleteStudentPost(formData: FormData) {
  await requireAdmin();
  const studentId = String(formData.get("studentId") || "");
  const postId = String(formData.get("postId") || "");
  const returnTo = getAdminStudentsReturnTo(formData);

  await prisma.user.findFirstOrThrow({
    where: { id: studentId, role: "student" },
    select: { id: true }
  });
  await prisma.buddyPost.updateMany({
    where: {
      id: postId,
      authorId: studentId,
      deletedAt: null
    },
    data: { deletedAt: new Date() }
  });

  revalidatePath("/admin/students");
  revalidatePath(`/admin/students/${studentId}`);
  revalidatePath("/buddy-circle");
  revalidatePath("/me");
  redirect(appendAdminStudentsMessage(returnTo, "notice", "学生帖子已删除"));
}

export async function createPublicSubject(formData: FormData) {
  await requireAdmin();
  const regionIds = getRegionIds(formData);
  await prisma.publicSubject.create({
    data: {
      name: String(formData.get("name") || "").trim(),
      code: String(formData.get("code") || "").trim() || null,
      description: String(formData.get("description") || "").trim() || null,
      sortOrder: await nextPublicSubjectSortOrder(),
      status: getStatus(formData),
      regions: {
        create: regionIds.map((regionId) => ({ regionId }))
      }
    }
  });
  revalidatePath("/admin/public-subjects");
  redirect("/admin/public-subjects");
}

export async function updatePublicSubject(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const regionIds = getRegionIds(formData);
  await prisma.$transaction([
    prisma.regionPublicSubject.deleteMany({ where: { publicSubjectId: id } }),
    prisma.publicSubject.update({
      where: { id },
      data: {
        name: String(formData.get("name") || "").trim(),
        code: String(formData.get("code") || "").trim() || null,
        description: String(formData.get("description") || "").trim() || null,
        status: getStatus(formData),
        regions: {
          create: regionIds.map((regionId) => ({ regionId }))
        }
      }
    })
  ]);
  revalidatePath("/admin/public-subjects");
  redirect("/admin/public-subjects");
}

export async function cyclePublicSubjectStatus(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const subject = await prisma.publicSubject.findUniqueOrThrow({
    where: { id },
    select: { status: true }
  });
  const nextStatus = subject.status === "draft" ? "published" : subject.status === "published" ? "archived" : "draft";
  await prisma.publicSubject.update({
    where: { id },
    data: { status: nextStatus }
  });
  revalidatePath("/admin/public-subjects");
}

export async function updatePublicSubjectStatus(formData: FormData) {
  await requireAdmin();
  await prisma.publicSubject.update({
    where: { id: String(formData.get("id")) },
    data: { status: getStatus(formData) }
  });
  revalidatePath("/admin/public-subjects");
}

export async function createPublicSubjectCourse(formData: FormData) {
  await requireAdmin();
  const publicSubjectId = String(formData.get("publicSubjectId") || "");
  const regionId = String(formData.get("regionId") || "");
  await prisma.regionPublicSubject.findUniqueOrThrow({
    where: { regionId_publicSubjectId: { regionId, publicSubjectId } }
  });
  await prisma.learningCourse.create({
    data: {
      regionId,
      publicSubjectId,
      courseType: "public_subject",
      name: String(formData.get("name") || "").trim(),
      description: String(formData.get("description") || "").trim() || null,
      status: getStatus(formData),
      sortOrder: await nextPublicSubjectCourseSortOrder(regionId, publicSubjectId)
    }
  });
  revalidatePath(`/admin/public-subjects/${publicSubjectId}/courses`);
  redirect(`/admin/public-subjects/${publicSubjectId}/courses`);
}

export async function updatePublicSubjectCourse(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  const publicSubjectId = String(formData.get("publicSubjectId") || "");
  const regionId = String(formData.get("regionId") || "");
  await prisma.regionPublicSubject.findUniqueOrThrow({
    where: { regionId_publicSubjectId: { regionId, publicSubjectId } }
  });
  await prisma.learningCourse.update({
    where: { id },
    data: {
      regionId,
      publicSubjectId,
      majorId: null,
      courseType: "public_subject",
      name: String(formData.get("name") || "").trim(),
      description: String(formData.get("description") || "").trim() || null,
      status: getStatus(formData)
    }
  });
  revalidatePath(`/admin/public-subjects/${publicSubjectId}/courses`);
  redirect(`/admin/public-subjects/${publicSubjectId}/courses`);
}

export async function updatePublicSubjectCourseStatus(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const publicSubjectId = String(formData.get("publicSubjectId"));
  await prisma.learningCourse.update({
    where: { id },
    data: { status: getStatus(formData) }
  });
  revalidatePath(`/admin/public-subjects/${publicSubjectId}/courses`);
}

export async function createMajor(formData: FormData) {
  await requireAdmin();
  const regionIds = getRegionIds(formData);
  await prisma.major.create({
    data: {
      name: String(formData.get("name") || "").trim(),
      description: String(formData.get("description") || "").trim() || null,
      sortOrder: await nextMajorSortOrder(),
      status: getStatus(formData),
      regions: {
        create: regionIds.map((regionId) => ({ regionId }))
      }
    }
  });
  revalidatePath("/admin/majors");
  redirect("/admin/majors");
}

export async function updateMajor(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const regionIds = getRegionIds(formData);
  await prisma.$transaction([
    prisma.regionMajor.deleteMany({ where: { majorId: id } }),
    prisma.major.update({
      where: { id },
      data: {
        name: String(formData.get("name") || "").trim(),
        description: String(formData.get("description") || "").trim() || null,
        status: getStatus(formData),
        regions: {
          create: regionIds.map((regionId) => ({ regionId }))
        }
      }
    })
  ]);
  revalidatePath("/admin/majors");
  redirect("/admin/majors");
}

export async function cycleMajorStatus(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const major = await prisma.major.findUniqueOrThrow({
    where: { id },
    select: { status: true }
  });
  const nextStatus = major.status === "draft" ? "published" : major.status === "published" ? "archived" : "draft";
  await prisma.major.update({
    where: { id },
    data: { status: nextStatus }
  });
  revalidatePath("/admin/majors");
}

export async function updateMajorStatus(formData: FormData) {
  await requireAdmin();
  await prisma.major.update({
    where: { id: String(formData.get("id")) },
    data: { status: getStatus(formData) }
  });
  revalidatePath("/admin/majors");
}

export async function deleteMajor(formData: FormData) {
  await requireAdmin();
  await deleteMajorWithContent(String(formData.get("id") || ""));
  revalidatePath("/admin/majors");
  revalidatePath("/admin/question-banks");
  redirect("/admin/majors");
}

export async function createMajorCourse(formData: FormData) {
  await requireAdmin();
  const majorId = String(formData.get("majorId") || "");
  const regionId = String(formData.get("regionId") || "");
  await prisma.regionMajor.findUniqueOrThrow({
    where: { regionId_majorId: { regionId, majorId } }
  });
  await prisma.learningCourse.create({
    data: {
      regionId,
      majorId,
      courseType: "major",
      name: String(formData.get("name") || "").trim(),
      description: String(formData.get("description") || "").trim() || null,
      status: getStatus(formData),
      sortOrder: await nextMajorCourseSortOrder(regionId, majorId)
    }
  });
  revalidatePath(`/admin/majors/${majorId}/courses`);
  redirect(`/admin/majors/${majorId}/courses`);
}

export async function updateMajorCourse(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  const majorId = String(formData.get("majorId") || "");
  const regionId = String(formData.get("regionId") || "");
  await prisma.regionMajor.findUniqueOrThrow({
    where: { regionId_majorId: { regionId, majorId } }
  });
  await prisma.learningCourse.update({
    where: { id },
    data: {
      regionId,
      majorId,
      publicSubjectId: null,
      courseType: "major",
      name: String(formData.get("name") || "").trim(),
      description: String(formData.get("description") || "").trim() || null,
      status: getStatus(formData)
    }
  });
  revalidatePath(`/admin/majors/${majorId}/courses`);
  redirect(`/admin/majors/${majorId}/courses`);
}

export async function deleteMajorCourse(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  const majorId = String(formData.get("majorId") || "");

  await prisma.learningCourse.findFirstOrThrow({
    where: {
      id,
      majorId,
      courseType: "major"
    },
    select: { id: true }
  });
  await prisma.learningCourse.delete({ where: { id } });

  revalidatePath(`/admin/majors/${majorId}/courses`);
  revalidatePath("/admin/question-banks");
  revalidatePath("/admin/question-banks/knowledge-points");
  redirect(`/admin/majors/${majorId}/courses`);
}

export async function cycleMajorCourseStatus(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const majorId = String(formData.get("majorId"));
  const course = await prisma.learningCourse.findUniqueOrThrow({
    where: { id },
    select: { status: true }
  });
  const nextStatus = course.status === "draft" ? "published" : course.status === "published" ? "archived" : "draft";
  await prisma.learningCourse.update({
    where: { id },
    data: { status: nextStatus }
  });
  revalidatePath(`/admin/majors/${majorId}/courses`);
}

export async function updateMajorCourseStatus(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const majorId = String(formData.get("majorId"));
  await prisma.learningCourse.update({
    where: { id },
    data: { status: getStatus(formData) }
  });
  revalidatePath(`/admin/majors/${majorId}/courses`);
}

function courseDetailPath(formData: FormData) {
  const ownerType = String(formData.get("ownerType") || "");
  const ownerId = String(formData.get("ownerId") || "");
  const courseId = String(formData.get("courseId") || "");

  if (ownerType === "public_subject") {
    return `/admin/public-subjects/${ownerId}/courses/${courseId}`;
  }
  return `/admin/majors/${ownerId}/courses/${courseId}`;
}

function getQuestionBankOwner(formData: FormData) {
  const ownerType = String(formData.get("ownerType") || "") as QuestionBankOwnerType;
  const ownerId = String(formData.get("ownerId") || "");

  if (ownerType !== "public_subject" && ownerType !== "major") {
    throw new Error("Invalid question bank owner type");
  }

  return { ownerType, ownerId };
}

function questionBankPath(ownerType: QuestionBankOwnerType, ownerId: string) {
  return `/admin/question-banks?type=${ownerType}&id=${encodeURIComponent(ownerId)}`;
}

function questionBankKnowledgeMapPath(_ownerType: QuestionBankOwnerType, _ownerId: string) {
  return "/admin/question-banks/knowledge-points";
}

function questionBankKnowledgeMapHref(ownerType: QuestionBankOwnerType, ownerId: string) {
  return `/admin/question-banks/knowledge-points?type=${ownerType}&id=${encodeURIComponent(ownerId)}`;
}

function getPaperYear(formData: FormData) {
  const raw = String(formData.get("year") || "").trim();
  if (!raw) {
    return null;
  }
  const year = Number(raw);
  return Number.isFinite(year) ? year : null;
}

function ownerCourseWhere(ownerType: QuestionBankOwnerType, ownerId: string, regionId?: string) {
  return {
    courseType: ownerType,
    ...(ownerType === "public_subject" ? { publicSubjectId: ownerId } : { majorId: ownerId }),
    ...(regionId ? { regionId } : {})
  };
}

function ownerPaperWhere(ownerType: QuestionBankOwnerType, ownerId: string, regionId?: string) {
  return {
    ownerType,
    ...(ownerType === "public_subject" ? { publicSubjectId: ownerId } : { majorId: ownerId }),
    ...(regionId ? { regionId } : {})
  };
}

async function ensureQuestionBankOwnerRegion(ownerType: QuestionBankOwnerType, ownerId: string, regionId: string) {
  await prisma.region.findUniqueOrThrow({ where: { id: regionId }, select: { id: true } });

  if (ownerType === "public_subject") {
    await prisma.publicSubject.findUniqueOrThrow({ where: { id: ownerId }, select: { id: true } });
    await prisma.regionPublicSubject.upsert({
      where: { regionId_publicSubjectId: { regionId, publicSubjectId: ownerId } },
      update: {},
      create: { regionId, publicSubjectId: ownerId }
    });
    return;
  }

  await prisma.major.findUniqueOrThrow({ where: { id: ownerId }, select: { id: true } });
  await prisma.regionMajor.upsert({
    where: { regionId_majorId: { regionId, majorId: ownerId } },
    update: {},
    create: { regionId, majorId: ownerId }
  });
}

async function ensureQuestionBankCourse(ownerType: QuestionBankOwnerType, ownerId: string, regionId: string) {
  const existing = await prisma.learningCourse.findFirst({
    where: ownerCourseWhere(ownerType, ownerId, regionId),
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true }
  });

  if (existing) {
    return existing;
  }

  const region = await prisma.region.findUniqueOrThrow({
    where: { id: regionId },
    select: { id: true }
  });

  if (ownerType === "public_subject") {
    const subject = await prisma.publicSubject.findUniqueOrThrow({
      where: { id: ownerId },
      select: { id: true, name: true }
    });
    await prisma.regionPublicSubject.upsert({
      where: {
        regionId_publicSubjectId: {
          regionId: region.id,
          publicSubjectId: subject.id
        }
      },
      update: {},
      create: {
        regionId: region.id,
        publicSubjectId: subject.id
      }
    });
    return prisma.learningCourse.create({
      data: {
        regionId: region.id,
        publicSubjectId: subject.id,
        name: subject.name,
        courseType: "public_subject",
        status: "published",
        sortOrder: await nextPublicSubjectCourseSortOrder(region.id, subject.id)
      },
      select: { id: true }
    });
  }

  const major = await prisma.major.findUniqueOrThrow({
    where: { id: ownerId },
    select: { id: true, name: true }
  });
  await prisma.regionMajor.upsert({
    where: {
      regionId_majorId: {
        regionId: region.id,
        majorId: major.id
      }
    },
    update: {},
    create: {
      regionId: region.id,
      majorId: major.id
    }
  });
  return prisma.learningCourse.create({
    data: {
      regionId: region.id,
      majorId: major.id,
      name: major.name,
      courseType: "major",
      status: "published",
      sortOrder: await nextMajorCourseSortOrder(region.id, major.id)
    },
    select: { id: true }
  });
}

async function touchQuestionBankPaper(paperId: string) {
  await prisma.examPaper.update({
    where: { id: paperId },
    data: { updatedAt: new Date() }
  });
}

export async function createQuestionBankPaper(formData: FormData) {
  await requireAdmin();
  const { ownerType, ownerId } = getQuestionBankOwner(formData);
  const regionId = String(formData.get("regionId") || "");
  await ensureQuestionBankOwnerRegion(ownerType, ownerId, regionId);

  await prisma.examPaper.create({
    data: {
      regionId,
      ownerType,
      publicSubjectId: ownerType === "public_subject" ? ownerId : null,
      majorId: ownerType === "major" ? ownerId : null,
      title: String(formData.get("title") || "").trim(),
      year: getPaperYear(formData),
      paperType: "real_exam",
      status: "published"
    }
  });

  revalidatePath("/admin/question-banks");
  redirect(questionBankPath(ownerType, ownerId));
}

export async function createQuestionBankOwner(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") || "").trim();
  const regionId = String(formData.get("regionId") || "");

  if (!name) {
    throw new Error("Question bank owner name is required");
  }

  const region = await prisma.region.findUniqueOrThrow({
    where: { id: regionId },
    select: { id: true }
  });
  const major = await prisma.major.create({
    data: {
      name,
      status: "published",
      sortOrder: Math.max(await nextQuestionBankOwnerSortOrder(), 1000),
      regions: {
        create: {
          regionId: region.id
        }
      }
    }
  });

  revalidatePath("/admin/question-banks");
  redirect(questionBankPath("major", major.id));
}

export async function renameQuestionBankOwner(formData: FormData) {
  await requireAdmin();
  const { ownerType, ownerId } = getQuestionBankOwner(formData);
  const name = String(formData.get("name") || "").trim();

  if (!name) {
    throw new Error("Question bank owner name is required");
  }

  if (ownerType === "public_subject") {
    await prisma.publicSubject.update({
      where: { id: ownerId },
      data: { name }
    });
  } else {
    await prisma.major.update({
      where: { id: ownerId },
      data: { name }
    });
  }

  revalidatePath("/admin/question-banks");
  redirect(questionBankPath(ownerType, ownerId));
}

export async function deleteQuestionBankOwner(formData: FormData) {
  await requireAdmin();
  const { ownerType, ownerId } = getQuestionBankOwner(formData);

  if (ownerType !== "major") {
    throw new Error("Only major question bank owners can be deleted here");
  }

  await deleteMajorWithContent(ownerId);
  revalidatePath("/admin/majors");
  revalidatePath("/admin/question-banks");
  redirect("/admin/question-banks");
}

export async function reorderQuestionBankOwners(formData: FormData) {
  await requireAdmin();
  const order = String(formData.get("order") || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  await prisma.$transaction(
    order.map((item, index) => {
      const [ownerType, ownerId] = item.split(":");
      if ((ownerType !== "public_subject" && ownerType !== "major") || !ownerId) {
        throw new Error("Invalid question bank owner order");
      }
      if (ownerType === "public_subject") {
        return prisma.publicSubject.update({
          where: { id: ownerId },
          data: { sortOrder: index }
        });
      }
      return prisma.major.update({
        where: { id: ownerId },
        data: { sortOrder: index }
      });
    })
  );

  revalidatePath("/admin/question-banks");
}

export async function updateQuestionBankPaper(formData: FormData) {
  await requireAdmin();
  const { ownerType, ownerId } = getQuestionBankOwner(formData);
  const id = String(formData.get("id") || "");
  const paper = await prisma.examPaper.findFirstOrThrow({
    where: {
      id,
      ...ownerPaperWhere(ownerType, ownerId)
    },
    select: { regionId: true, updatedAt: true }
  });
  const regionId = String(formData.get("regionId") || paper.regionId);
  await ensureQuestionBankOwnerRegion(ownerType, ownerId, regionId);

  await prisma.examPaper.update({
    where: { id },
    data: {
      regionId,
      title: String(formData.get("title") || "").trim(),
      year: getPaperYear(formData),
      updatedAt: paper.updatedAt
    }
  });

  revalidatePath("/admin/question-banks");
  redirect(questionBankPath(ownerType, ownerId));
}

export async function deleteQuestionBankPaper(formData: FormData) {
  await requireAdmin();
  const { ownerType, ownerId } = getQuestionBankOwner(formData);
  const id = String(formData.get("id") || "");
  await prisma.examPaper.findFirstOrThrow({
    where: {
      id,
      ...ownerPaperWhere(ownerType, ownerId)
    },
    select: { id: true }
  });
  await prisma.examPaper.delete({ where: { id } });
  revalidatePath("/admin/question-banks");
  redirect(questionBankPath(ownerType, ownerId));
}

export async function toggleQuestionBankPaperStatus(formData: FormData) {
  await requireAdmin();
  const { ownerType, ownerId } = getQuestionBankOwner(formData);
  const id = String(formData.get("id") || "");
  const paper = await prisma.examPaper.findFirstOrThrow({
    where: {
      id,
      ...ownerPaperWhere(ownerType, ownerId)
    },
    select: { status: true, updatedAt: true }
  });

  await prisma.examPaper.update({
    where: { id },
    data: {
      status: paper.status === "published" ? "archived" : "published",
      updatedAt: paper.updatedAt
    }
  });

  revalidatePath("/admin/question-banks");
}

export async function createSyllabusItem(formData: FormData) {
  await requireAdmin();
  const courseId = String(formData.get("courseId") || "");
  const parentId = String(formData.get("parentId") || "") || null;
  const [code, sortOrder] = await Promise.all([
    nextSyllabusItemCode(courseId, parentId),
    nextSyllabusItemSortOrder(courseId, parentId)
  ]);
  await prisma.syllabusItem.create({
    data: {
      courseId,
      parentId,
      code,
      title: String(formData.get("title") || "").trim(),
      description: String(formData.get("description") || "").trim() || null,
      requirement: getSyllabusRequirement(formData),
      status: getStatus(formData),
      sortOrder
    }
  });
  const path = courseDetailPath(formData);
  revalidatePath(path);
}

export async function updateSyllabusItem(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  const courseId = String(formData.get("courseId") || "");
  const current = await prisma.syllabusItem.findFirstOrThrow({
    where: { id, courseId, checkpointScope: null },
    select: { id: true, parentId: true, code: true, sortOrder: true }
  });
  const parentId = formData.has("parentId") ? String(formData.get("parentId") || "") || null : current.parentId;
  if (parentId) {
    await prisma.syllabusItem.findFirstOrThrow({
      where: { id: parentId, courseId, checkpointScope: null },
      select: { id: true }
    });
  }
  const submittedCode = String(formData.get("code") || "").trim();
  const code = formData.has("code") ? submittedCode || null : parentId === current.parentId ? current.code : await nextSyllabusItemCode(courseId, parentId);
  await prisma.syllabusItem.update({
    where: { id },
    data: {
      courseId,
      parentId,
      code,
      title: String(formData.get("title") || "").trim(),
      description: String(formData.get("description") || "").trim() || null,
      requirement: getSyllabusRequirement(formData),
      status: getStatus(formData),
      sortOrder: formData.has("sortOrder") ? Number(formData.get("sortOrder") || current.sortOrder) : current.sortOrder
    }
  });
  const path = courseDetailPath(formData);
  revalidatePath(path);
}

export async function updateSyllabusItemStatus(formData: FormData) {
  await requireAdmin();
  await prisma.syllabusItem.update({
    where: { id: String(formData.get("id") || ""), checkpointScope: null },
    data: { status: getStatus(formData) }
  });
  revalidatePath(courseDetailPath(formData));
}

export async function deleteSyllabusItem(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  const courseId = String(formData.get("courseId") || "");
  await prisma.syllabusItem.findFirstOrThrow({
    where: { id, courseId, checkpointScope: null },
    select: { id: true }
  });
  await prisma.syllabusItem.delete({ where: { id } });
  const path = courseDetailPath(formData);
  revalidatePath(path);
  redirect(path);
}

export async function createQuestionBankKnowledgeMapItem(formData: FormData) {
  await requireAdmin();
  const { ownerType, ownerId } = getQuestionBankOwner(formData);
  const courseId = String(formData.get("courseId") || "");
  const parentId = String(formData.get("parentId") || "") || null;
  const title = String(formData.get("title") || "").trim();

  if (!title) {
    throw new Error("Knowledge point title is required");
  }

  const course = await prisma.learningCourse.findFirstOrThrow({
    where: {
      id: courseId,
      courseType: ownerType,
      ...(ownerType === "public_subject" ? { publicSubjectId: ownerId } : { majorId: ownerId })
    },
    select: { id: true }
  });

  if (parentId) {
    await prisma.syllabusItem.findFirstOrThrow({
      where: { id: parentId, courseId: course.id, checkpointScope: null },
      select: { id: true }
    });
  }

  const [code, sortOrder] = await Promise.all([
    nextSyllabusItemCode(course.id, parentId),
    nextSyllabusItemSortOrder(course.id, parentId)
  ]);

  await prisma.syllabusItem.create({
    data: {
      courseId: course.id,
      parentId,
      code,
      title,
      description: String(formData.get("description") || "").trim() || null,
      requirement: null,
      status: "published",
      sortOrder
    }
  });

  revalidatePath(questionBankKnowledgeMapPath(ownerType, ownerId));
  redirect(questionBankKnowledgeMapHref(ownerType, ownerId));
}

export async function createQuestionBankKnowledgeMapOwner(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") || "").trim();

  if (!name) {
    throw new Error("Knowledge point name is required");
  }

  const region = await prisma.region.findFirstOrThrow({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true }
  });

  const major = await prisma.major.create({
    data: {
      name,
      status: "published",
      sortOrder: await nextQuestionBankOwnerSortOrder(),
      regions: {
        create: {
          regionId: region.id
        }
      }
    }
  });

  await ensureQuestionBankCourse("major", major.id, region.id);
  revalidatePath("/admin/question-banks");
  revalidatePath(questionBankKnowledgeMapPath("major", major.id));
  redirect(questionBankKnowledgeMapHref("major", major.id));
}

export async function renameQuestionBankKnowledgeMapOwner(formData: FormData) {
  await requireAdmin();
  const { ownerType, ownerId } = getQuestionBankOwner(formData);
  const name = String(formData.get("name") || "").trim();

  if (!name) {
    throw new Error("Knowledge point name is required");
  }

  if (ownerType === "public_subject") {
    await prisma.publicSubject.update({
      where: { id: ownerId },
      data: { name }
    });
  } else {
    await prisma.major.update({
      where: { id: ownerId },
      data: { name }
    });
  }

  revalidatePath("/admin/question-banks");
  revalidatePath(questionBankKnowledgeMapPath(ownerType, ownerId));
  redirect(questionBankKnowledgeMapHref(ownerType, ownerId));
}

export async function deleteQuestionBankKnowledgeMapOwner(formData: FormData) {
  await requireAdmin();
  const { ownerType, ownerId } = getQuestionBankOwner(formData);

  if (ownerType === "public_subject") {
    await prisma.publicSubject.update({
      where: { id: ownerId },
      data: { status: "archived" }
    });
  } else {
    await prisma.major.update({
      where: { id: ownerId },
      data: { status: "archived" }
    });
  }

  revalidatePath("/admin/question-banks");
  revalidatePath(questionBankKnowledgeMapPath(ownerType, ownerId));
  redirect("/admin/question-banks/knowledge-points");
}

export async function renameQuestionBankKnowledgeMapItem(formData: FormData) {
  await requireAdmin();
  const { ownerType, ownerId } = getQuestionBankOwner(formData);
  const id = String(formData.get("id") || "");
  const courseId = String(formData.get("courseId") || "");
  const title = String(formData.get("title") || "").trim();

  if (!title) {
    throw new Error("Knowledge point title is required");
  }

  await prisma.syllabusItem.findFirstOrThrow({
    where: {
      id,
      courseId,
      checkpointScope: null,
      course: ownerCourseWhere(ownerType, ownerId)
    },
    select: { id: true }
  });

  await prisma.syllabusItem.update({
    where: { id },
    data: { title }
  });

  revalidatePath(questionBankKnowledgeMapPath(ownerType, ownerId));
  redirect(questionBankKnowledgeMapHref(ownerType, ownerId));
}

export async function deleteQuestionBankKnowledgeMapCourse(formData: FormData) {
  await requireAdmin();
  const { ownerType, ownerId } = getQuestionBankOwner(formData);
  const courseId = String(formData.get("courseId") || "");

  await prisma.learningCourse.findFirstOrThrow({
    where: {
      id: courseId,
      courseType: ownerType,
      ...(ownerType === "public_subject" ? { publicSubjectId: ownerId } : { majorId: ownerId })
    },
    select: { id: true }
  });

  await prisma.learningCourse.delete({ where: { id: courseId } });

  revalidatePath(questionBankKnowledgeMapPath(ownerType, ownerId));
  redirect(questionBankKnowledgeMapHref(ownerType, ownerId));
}

export async function deleteQuestionBankKnowledgeMapItem(formData: FormData) {
  await requireAdmin();
  const { ownerType, ownerId } = getQuestionBankOwner(formData);
  const id = String(formData.get("id") || "");
  const courseId = String(formData.get("courseId") || "");

  await prisma.syllabusItem.findFirstOrThrow({
    where: {
      id,
      courseId,
      checkpointScope: null,
      course: ownerCourseWhere(ownerType, ownerId)
    },
    select: { id: true }
  });

  await prisma.syllabusItem.delete({ where: { id } });

  revalidatePath(questionBankKnowledgeMapPath(ownerType, ownerId));
  redirect(questionBankKnowledgeMapHref(ownerType, ownerId));
}

function buildSyllabusChapterTitle(syllabusItem: { code: string | null; title: string }) {
  return `${syllabusItem.code ? `${syllabusItem.code} ` : ""}${syllabusItem.title}`.trim();
}

async function ensureCourseChapter(courseId: string, title: string) {
  const existing = await prisma.chapter.findFirst({
    where: { courseId, title },
    select: { id: true }
  });
  if (existing) {
    return existing;
  }

  const subject = await prisma.subject.findFirstOrThrow({
    where: { province: "江苏", examType: "专转本", name: "计算机" },
    select: { id: true }
  });

  return prisma.chapter.create({
    data: {
      subjectId: subject.id,
      courseId,
      title,
      sortOrder: await nextCourseChapterSortOrder(courseId),
      status: "published"
    },
    select: { id: true }
  });
}

function normalizeQuestionBankOptionKey(value: FormDataEntryValue | string) {
  return String(value).trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 1);
}

function getQuestionBankOptionKeys(formData: FormData) {
  const submittedKeys = formData
    .getAll("optionKey")
    .map(normalizeQuestionBankOptionKey)
    .filter((item, index, array) => alphabetOptionKeys.includes(item) && array.indexOf(item) === index)
    .sort((left, right) => alphabetOptionKeys.indexOf(left) - alphabetOptionKeys.indexOf(right));

  return submittedKeys.length > 0 ? submittedKeys : [...optionKeys];
}

function getQuestionBankChoiceOptions(formData: FormData) {
  const submittedKeys = formData.getAll("optionKey").map(normalizeQuestionBankOptionKey);
  const submittedTexts = formData.getAll("optionText").map((item) => String(item).trim());

  if (submittedTexts.length > 0) {
    const seen = new Set<string>();
    return submittedKeys
      .map((key, index) => ({
        key,
        text: submittedTexts[index] || ""
      }))
      .filter((option) => {
        if (!alphabetOptionKeys.includes(option.key) || seen.has(option.key)) {
          return false;
        }
        seen.add(option.key);
        return true;
      })
      .sort((left, right) => alphabetOptionKeys.indexOf(left.key) - alphabetOptionKeys.indexOf(right.key));
  }

  return getQuestionBankOptionKeys(formData).map((key) => ({
    key,
    text: String(formData.get(`option${key}`) || "").trim()
  }));
}

function getQuestionBankChoiceAnswers(formData: FormData, options: QuestionOption[]) {
  const optionKeySet = new Set(options.map((option) => option.key));
  return formData
    .getAll("answer")
    .map((item) => String(item).trim())
    .filter((item, index, array) => optionKeySet.has(item) && array.indexOf(item) === index)
    .sort((left, right) => alphabetOptionKeys.indexOf(left) - alphabetOptionKeys.indexOf(right));
}

const trueFalseOptions: QuestionOption[] = [
  { key: "A", text: "正确" },
  { key: "B", text: "错误" }
];

function getFillBlankAnswers(formData: FormData) {
  return formData
    .getAll("answer")
    .map((item) => String(item).trim())
    .filter(Boolean);
}

function getRichTextAnswer(formData: FormData) {
  const answer = String(formData.get("answer") || "").trim();
  return answer ? [answer] : [];
}

function getQuestionBankQuestionPayload(formData: FormData, type: QuestionBankEditableQuestionType) {
  const stem = String(formData.get("stem") || "").trim();

  if (type === "true_false") {
    const answer = String(formData.get("answer") || "").trim();
    return {
      stem,
      options: trueFalseOptions,
      answers: answer === "A" || answer === "B" ? [answer] : []
    };
  }

  if (type === "fill_blank") {
    return {
      stem,
      options: [],
      answers: getFillBlankAnswers(formData)
    };
  }

  if (isQuestionBankRichAnswerQuestionType(type)) {
    return {
      stem,
      options: [],
      answers: getRichTextAnswer(formData)
    };
  }

  const options = getQuestionBankChoiceOptions(formData);
  return {
    stem,
    options,
    answers: getQuestionBankChoiceAnswers(formData, options)
  };
}

function validateQuestionBankQuestion({
  stem,
  options,
  answers,
  type
}: {
  stem: string;
  options: QuestionOption[];
  answers: string[];
  type: QuestionBankEditableQuestionType;
}) {
  if (!stem) {
    throw new Error("Question stem is required");
  }
  if (isQuestionBankChoiceQuestionType(type) && options.some((option) => !option.text)) {
    throw new Error("Choice options are required");
  }
  if (type === "single_choice" && answers.length !== 1) {
    throw new Error("Single choice answer is required");
  }
  if (type === "multiple_choice" && answers.length < 2) {
    throw new Error("Multiple choice answers are required");
  }
  if (type === "true_false" && answers.length !== 1) {
    throw new Error("True false answer is required");
  }
  if (type === "fill_blank" && answers.length < 1) {
    throw new Error("Fill blank answer is required");
  }
  if (isQuestionBankRichAnswerQuestionType(type) && type !== "material_analysis" && answers.length < 1) {
    throw new Error("Rich answer question answer is required");
  }
}

async function createQuestionBankQuestion(formData: FormData, type: QuestionBankEditableQuestionType) {
  await requireAdmin();
  const paperId = String(formData.get("paperId") || "");
  const { stem, options, answers } = getQuestionBankQuestionPayload(formData, type);

  validateQuestionBankQuestion({ stem, options, answers, type });

  const paper = await prisma.examPaper.findUniqueOrThrow({
    where: { id: paperId },
    select: {
      id: true,
      title: true,
      year: true
    }
  });
  const question = await prisma.question.create({
    data: {
      type,
      stem,
      options,
      answer: answers,
      analysis: String(formData.get("analysis") || "").trim(),
      source: paper.title,
      sourceType: "manual",
      sourceYear: paper.year,
      difficulty: "medium",
      status: "published"
    },
    select: { id: true }
  });

  await prisma.examPaperQuestion.create({
    data: {
      paperId: paper.id,
      questionId: question.id,
      sortOrder: await nextExamPaperQuestionSortOrder(paper.id)
    }
  });
  await touchQuestionBankPaper(paper.id);

  revalidatePath(`/admin/question-banks/${paper.id}`);
  redirect(`/admin/question-banks/${paper.id}`);
}

export async function createQuestionBankSingleChoiceQuestion(formData: FormData) {
  await createQuestionBankQuestion(formData, "single_choice");
}

export async function createQuestionBankMultipleChoiceQuestion(formData: FormData) {
  await createQuestionBankQuestion(formData, "multiple_choice");
}

export async function createQuestionBankTrueFalseQuestion(formData: FormData) {
  await createQuestionBankQuestion(formData, "true_false");
}

export async function createQuestionBankFillBlankQuestion(formData: FormData) {
  await createQuestionBankQuestion(formData, "fill_blank");
}

export async function createQuestionBankCalculationQuestion(formData: FormData) {
  await createQuestionBankQuestion(formData, "calculation");
}

export async function createQuestionBankProofQuestion(formData: FormData) {
  await createQuestionBankQuestion(formData, "proof");
}

export async function createQuestionBankComprehensiveQuestion(formData: FormData) {
  await createQuestionBankQuestion(formData, "comprehensive");
}

export async function createQuestionBankTypedQuestion(formData: FormData) {
  const type = String(formData.get("questionType") || "");
  if (!isQuestionBankEditableQuestionType(type)) {
    throw new Error("Unsupported question type");
  }

  await createQuestionBankQuestion(formData, type);
}

export async function updateQuestionBankQuestion(formData: FormData) {
  await requireAdmin();
  const paperId = String(formData.get("paperId") || "");
  const paperQuestionId = String(formData.get("paperQuestionId") || "");
  const type = String(formData.get("questionType") || "");

  if (!isQuestionBankEditableQuestionType(type)) {
    throw new Error("Unsupported question type");
  }

  const { stem, options, answers } = getQuestionBankQuestionPayload(formData, type);
  validateQuestionBankQuestion({ stem, options, answers, type });

  const paperQuestion = await prisma.examPaperQuestion.findFirstOrThrow({
    where: {
      id: paperQuestionId,
      paperId
    },
    select: {
      questionId: true,
      paperId: true
    }
  });

  await prisma.question.update({
    where: { id: paperQuestion.questionId },
    data: {
      type,
      stem,
      options,
      answer: answers,
      analysis: String(formData.get("analysis") || "").trim()
    }
  });
  await touchQuestionBankPaper(paperQuestion.paperId);

  revalidatePath("/admin/question-banks");
  return {
    paperQuestionId,
    type,
    stem,
    options,
    answer: answers,
    analysis: String(formData.get("analysis") || "").trim()
  };
}

export async function updateQuestionBankQuestionType(formData: FormData) {
  await requireAdmin();
  const paperId = String(formData.get("paperId") || "");
  const paperQuestionId = String(formData.get("paperQuestionId") || "");
  const type = String(formData.get("questionType") || "");

  if (!isQuestionBankEditableQuestionType(type)) {
    throw new Error("Unsupported question type");
  }

  const paperQuestion = await prisma.examPaperQuestion.findFirstOrThrow({
    where: {
      id: paperQuestionId,
      paperId
    },
    select: {
      questionId: true,
      paperId: true
    }
  });

  await prisma.question.update({
    where: { id: paperQuestion.questionId },
    data: { type }
  });

  revalidatePath(`/admin/question-banks/${paperQuestion.paperId}`);
}

export async function updateQuestionBankQuestionTypeConfig(formData: FormData) {
  await requireAdmin();
  const paperId = String(formData.get("paperId") || "");
  const config = parseQuestionBankQuestionTypeConfig(JSON.parse(String(formData.get("config") || "null")));

  if (!config) {
    throw new Error("At least one question type is required");
  }

  await prisma.examPaper.update({
    where: { id: paperId },
    data: { questionTypeConfig: config }
  });

  revalidatePath(`/admin/question-banks/${paperId}`);
}

export async function updateQuestionBankChoiceQuestion(formData: FormData) {
  await updateQuestionBankQuestion(formData);
}

export async function deleteQuestionBankPaperQuestion(formData: FormData) {
  await requireAdmin();
  const paperId = String(formData.get("paperId") || "");
  const paperQuestionId = String(formData.get("paperQuestionId") || "");
  const paperQuestion = await prisma.examPaperQuestion.findFirstOrThrow({
    where: {
      id: paperQuestionId,
      paperId
    },
    select: {
      questionId: true,
      paperId: true
    }
  });

  await prisma.$transaction(async (tx) => {
    await tx.examPaperQuestion.delete({
      where: { id: paperQuestionId }
    });
    const remainingLinks = await tx.examPaperQuestion.count({
      where: { questionId: paperQuestion.questionId }
    });
    if (remainingLinks === 0) {
      await tx.question.delete({
        where: { id: paperQuestion.questionId }
      });
    }
  });
  await touchQuestionBankPaper(paperQuestion.paperId);

  revalidatePath(`/admin/question-banks/${paperQuestion.paperId}`);
  redirect(`/admin/question-banks/${paperQuestion.paperId}`);
}

export async function reorderQuestionBankPaperQuestions(formData: FormData) {
  await requireAdmin();
  const paperId = String(formData.get("paperId") || "");
  const submittedOrder = String(formData.get("order") || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const currentLinks = await prisma.examPaperQuestion.findMany({
    where: { paperId },
    select: { id: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
  });
  const currentIds = new Set(currentLinks.map((item) => item.id));
  const nextOrder = [
    ...submittedOrder.filter((id, index, array) => currentIds.has(id) && array.indexOf(id) === index),
    ...currentLinks.map((item) => item.id).filter((id) => !submittedOrder.includes(id))
  ];

  await prisma.$transaction(
    nextOrder.map((id, index) =>
      prisma.examPaperQuestion.update({
        where: { id },
        data: { sortOrder: index + 1 }
      })
    )
  );

  revalidatePath(`/admin/question-banks/${paperId}`);
}

export async function createCourseKnowledgePoint(formData: FormData) {
  await requireAdmin();
  const courseId = String(formData.get("courseId") || "");
  const syllabusItemId = String(formData.get("syllabusItemId") || "");
  const syllabusItem = await prisma.syllabusItem.findFirstOrThrow({
    where: { id: syllabusItemId, courseId, checkpointScope: null },
    select: { id: true, code: true, title: true }
  });
  const chapterTitle = String(formData.get("chapterTitle") || "").trim() || buildSyllabusChapterTitle(syllabusItem);
  const chapter = await ensureCourseChapter(courseId, chapterTitle);

  await prisma.knowledgePoint.create({
    data: {
      chapterId: chapter.id,
      syllabusItemId,
      title: String(formData.get("title") || "").trim(),
      summary: String(formData.get("summary") || "").trim(),
      content: String(formData.get("content") || "").trim(),
      sortOrder: await nextKnowledgePointSortOrder(chapter.id, syllabusItemId),
      estimatedMinutes: Number(formData.get("estimatedMinutes") || 8),
      status: getStatus(formData)
    }
  });
  const path = courseDetailPath(formData);
  revalidatePath(path);
  redirect(path);
}

export async function updateCourseKnowledgePoint(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  const courseId = String(formData.get("courseId") || "");
  const syllabusItemId = String(formData.get("syllabusItemId") || "") || null;

  if (syllabusItemId) {
    await prisma.syllabusItem.findFirstOrThrow({
      where: { id: syllabusItemId, courseId, checkpointScope: null },
      select: { id: true }
    });
  }
  await prisma.knowledgePoint.findFirstOrThrow({
    where: { id, chapter: { courseId } },
    select: { id: true }
  });

  await prisma.knowledgePoint.update({
    where: { id },
    data: {
      syllabusItemId,
      title: String(formData.get("title") || "").trim(),
      summary: String(formData.get("summary") || "").trim(),
      content: String(formData.get("content") || "").trim(),
      sortOrder: Number(formData.get("sortOrder") || 0),
      estimatedMinutes: Number(formData.get("estimatedMinutes") || 8),
      status: getStatus(formData)
    }
  });
  const path = courseDetailPath(formData);
  revalidatePath(path);
  redirect(path);
}

export async function updateCourseKnowledgePointStatus(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  const courseId = String(formData.get("courseId") || "");
  await prisma.knowledgePoint.findFirstOrThrow({
    where: { id, chapter: { courseId } },
    select: { id: true }
  });
  await prisma.knowledgePoint.update({
    where: { id },
    data: { status: getStatus(formData) }
  });
  revalidatePath(courseDetailPath(formData));
}

export async function createChapter(formData: FormData) {
  await requireAdmin();
  const subject = await prisma.subject.findFirstOrThrow({
    where: { province: "江苏", examType: "专转本", name: "计算机" }
  });
  await prisma.chapter.create({
    data: {
      subjectId: subject.id,
      title: String(formData.get("title") || "").trim(),
      sortOrder: Number(formData.get("sortOrder") || 0),
      status: getStatus(formData)
    }
  });
  revalidatePath("/admin/chapters");
  redirect("/admin/chapters");
}

export async function updateChapterStatus(formData: FormData) {
  await requireAdmin();
  await prisma.chapter.update({
    where: { id: String(formData.get("id")) },
    data: { status: getStatus(formData) }
  });
  revalidatePath("/admin/chapters");
}

export async function updateChapter(formData: FormData) {
  await requireAdmin();
  await prisma.chapter.update({
    where: { id: String(formData.get("id")) },
    data: {
      title: String(formData.get("title") || "").trim(),
      sortOrder: Number(formData.get("sortOrder") || 0),
      status: getStatus(formData)
    }
  });
  revalidatePath("/admin/chapters");
  redirect("/admin/chapters");
}

export async function createKnowledgePoint(formData: FormData) {
  await requireAdmin();
  await prisma.knowledgePoint.create({
    data: {
      chapterId: String(formData.get("chapterId")),
      title: String(formData.get("title") || "").trim(),
      summary: String(formData.get("summary") || "").trim(),
      content: String(formData.get("content") || "").trim(),
      sortOrder: Number(formData.get("sortOrder") || 0),
      estimatedMinutes: Number(formData.get("estimatedMinutes") || 8),
      status: getStatus(formData)
    }
  });
  revalidatePath("/admin/knowledge-points");
  redirect("/admin/knowledge-points");
}

export async function updateKnowledgePointStatus(formData: FormData) {
  await requireAdmin();
  await prisma.knowledgePoint.update({
    where: { id: String(formData.get("id")) },
    data: { status: getStatus(formData) }
  });
  revalidatePath("/admin/knowledge-points");
}

export async function updateKnowledgePoint(formData: FormData) {
  await requireAdmin();
  await prisma.knowledgePoint.update({
    where: { id: String(formData.get("id")) },
    data: {
      chapterId: String(formData.get("chapterId")),
      title: String(formData.get("title") || "").trim(),
      summary: String(formData.get("summary") || "").trim(),
      content: String(formData.get("content") || "").trim(),
      sortOrder: Number(formData.get("sortOrder") || 0),
      estimatedMinutes: Number(formData.get("estimatedMinutes") || 8),
      status: getStatus(formData)
    }
  });
  revalidatePath("/admin/knowledge-points");
  redirect("/admin/knowledge-points");
}

export async function createQuestion(formData: FormData) {
  await requireAdmin();
  const type = getQuestionType(formData);
  const knowledgePointId = String(formData.get("knowledgePointId"));
  const knowledgePoint = await prisma.knowledgePoint.findUniqueOrThrow({
    where: { id: knowledgePointId },
    select: { syllabusItemId: true }
  });
  await prisma.question.create({
    data: {
      knowledgePointId,
      syllabusItemId: knowledgePoint.syllabusItemId,
      type,
      stem: String(formData.get("stem") || "").trim(),
      options: buildQuestionOptions(formData),
      answer: buildQuestionAnswer(formData, type),
      analysis: String(formData.get("analysis") || "").trim(),
      source: String(formData.get("source") || "人工录入").trim(),
      difficulty: String(formData.get("difficulty") || "medium") as Difficulty,
      status: getStatus(formData)
    }
  });
  revalidatePath("/admin/questions");
  redirect(`/admin/questions?knowledgePointId=${encodeURIComponent(knowledgePointId)}`);
}

export async function updateQuestion(formData: FormData) {
  await requireAdmin();
  const type = getQuestionType(formData);
  const knowledgePointId = String(formData.get("knowledgePointId"));
  const knowledgePoint = await prisma.knowledgePoint.findUniqueOrThrow({
    where: { id: knowledgePointId },
    select: { syllabusItemId: true }
  });
  await prisma.question.update({
    where: { id: String(formData.get("id")) },
    data: {
      knowledgePointId,
      syllabusItemId: knowledgePoint.syllabusItemId,
      type,
      stem: String(formData.get("stem") || "").trim(),
      options: buildQuestionOptions(formData),
      answer: buildQuestionAnswer(formData, type),
      analysis: String(formData.get("analysis") || "").trim(),
      source: String(formData.get("source") || "人工录入").trim(),
      difficulty: String(formData.get("difficulty") || "medium") as Difficulty,
      status: getStatus(formData)
    }
  });
  revalidatePath("/admin/questions");
  redirect("/admin/questions");
}

export async function updateQuestionStatus(formData: FormData) {
  await requireAdmin();
  await prisma.question.update({
    where: { id: String(formData.get("id")) },
    data: { status: getStatus(formData) }
  });
  revalidatePath("/admin/questions");
}
