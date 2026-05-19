"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ContentStatus, Difficulty, QuestionType, RegionStatus, SyllabusRequirement } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type QuestionOption = {
  key: string;
  text: string;
};

const optionKeys = ["A", "B", "C", "D"] as const;

function getStatus(formData: FormData) {
  return String(formData.get("status") || "draft") as ContentStatus;
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
    where: { courseId, parentId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true }
  });
  return (latest?.sortOrder ?? 0) + 1;
}

async function nextSyllabusItemCode(courseId: string, parentId: string | null) {
  const [parent, siblings] = await Promise.all([
    parentId
      ? prisma.syllabusItem.findFirstOrThrow({
          where: { id: parentId, courseId },
          select: { code: true }
        })
      : Promise.resolve(null),
    prisma.syllabusItem.findMany({
      where: { courseId, parentId },
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

function buildRegionName(province: string, studySystem: string) {
  return `${province}${studySystem}`.trim();
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
  redirect(path);
}

export async function updateSyllabusItem(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  const courseId = String(formData.get("courseId") || "");
  const current = await prisma.syllabusItem.findFirstOrThrow({
    where: { id, courseId },
    select: { id: true, parentId: true, code: true, sortOrder: true }
  });
  const parentId = formData.has("parentId") ? String(formData.get("parentId") || "") || null : current.parentId;
  if (parentId) {
    await prisma.syllabusItem.findFirstOrThrow({
      where: { id: parentId, courseId },
      select: { id: true }
    });
  }
  const code = parentId === current.parentId ? current.code : await nextSyllabusItemCode(courseId, parentId);
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
  redirect(path);
}

export async function updateSyllabusItemStatus(formData: FormData) {
  await requireAdmin();
  await prisma.syllabusItem.update({
    where: { id: String(formData.get("id") || "") },
    data: { status: getStatus(formData) }
  });
  revalidatePath(courseDetailPath(formData));
}

export async function deleteSyllabusItem(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  const courseId = String(formData.get("courseId") || "");
  await prisma.syllabusItem.findFirstOrThrow({
    where: { id, courseId },
    select: { id: true }
  });
  await prisma.syllabusItem.delete({ where: { id } });
  const path = courseDetailPath(formData);
  revalidatePath(path);
  redirect(path);
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

export async function createCourseKnowledgePoint(formData: FormData) {
  await requireAdmin();
  const courseId = String(formData.get("courseId") || "");
  const syllabusItemId = String(formData.get("syllabusItemId") || "");
  const syllabusItem = await prisma.syllabusItem.findFirstOrThrow({
    where: { id: syllabusItemId, courseId },
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
      where: { id: syllabusItemId, courseId },
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
