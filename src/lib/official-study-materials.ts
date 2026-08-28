import crypto from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { adminPurchaseStudentWhere } from "@/lib/admin-study-project-purchases";
import { publicOfficialMaterialWhere } from "@/lib/study-project-access";
import { deleteAiStudyObject, uploadAiStudyObject } from "@/lib/ai-study-storage";

const maxOfficialMaterialBytes = 80 * 1024 * 1024;

const updateMaterialSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional().nullable(),
  scopeType: z.enum(["major", "public_subject"]).optional().nullable(),
  scopeId: z.string().trim().max(120).optional().nullable(),
  sortOrder: z.number().int().min(-10000).max(10000).optional()
});

export class OfficialStudyMaterialError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string
  ) {
    super(message);
    this.name = "OfficialStudyMaterialError";
  }
}

export type OfficialStudyMaterialUpload = {
  fileName: string;
  mimeType: string;
  size: number;
  body: Buffer;
};

export async function listOfficialStudyMaterialScopes() {
  const [majors, publicSubjects] = await Promise.all([
    prisma.major.findMany({
      where: { status: "published" },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true }
    }),
    prisma.publicSubject.findMany({
      where: {
        status: "published",
        name: { in: ["大学语文", "高等数学"] }
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true }
    })
  ]);
  return [
    ...majors.map((item) => ({ ...item, type: "major" as const })),
    ...publicSubjects.map((item) => ({ ...item, type: "public_subject" as const }))
  ];
}

export async function listAdminOfficialStudyMaterials() {
  return prisma.officialStudyMaterial.findMany({
    where: { deletedAt: null },
    orderBy: [{ createdAt: "desc" }],
    take: 300,
    include: {
      _count: { select: { purchases: { where: adminPurchaseStudentWhere } } },
      course: { select: { id: true, name: true } },
      major: { select: { id: true, name: true } },
      publicSubject: { select: { id: true, name: true } },
      createdBy: { select: { id: true, username: true } }
    }
  });
}

export async function listPublicOfficialStudyMaterials(input: { userId: string; take?: number }) {
  const take = typeof input.take === "number" ? Math.max(1, Math.min(input.take, 200)) : undefined;
  return prisma.officialStudyMaterial.findMany({
    where: await publicOfficialMaterialWhere(input.userId),
    orderBy: [{ sortOrder: "desc" }, { publishedAt: "desc" }, { createdAt: "desc" }],
    ...(take ? { take } : {}),
    include: {
      course: { select: { id: true, name: true } },
      major: { select: { id: true, name: true } },
      publicSubject: { select: { id: true, name: true } }
    }
  });
}

export async function createOfficialStudyMaterial(
  adminId: string,
  input: OfficialStudyMaterialUpload
) {
  const detected = detectOfficialMaterialFile(input.fileName, input.mimeType, input.body);
  if (input.size <= 0 || input.body.length <= 0) {
    throw new OfficialStudyMaterialError("资料文件不能为空。", 400, "OFFICIAL_MATERIAL_EMPTY_FILE");
  }
  if (input.size > maxOfficialMaterialBytes || input.body.length > maxOfficialMaterialBytes) {
    throw new OfficialStudyMaterialError("单个资料文件不能超过 80MB。", 413, "OFFICIAL_MATERIAL_FILE_TOO_LARGE");
  }
  const id = crypto.randomUUID();
  const title = buildDefaultTitle(input.fileName);
  const safeFileName = sanitizeFileName(input.fileName);
  const storageKey = `official-study-materials/${id}/${safeFileName}`;
  await prisma.officialStudyMaterial.create({
    data: {
      id,
      createdById: adminId,
      title,
      fileType: detected.fileType,
      originalFileName: input.fileName,
      mimeType: detected.mimeType,
      fileSizeBytes: input.body.length,
      fileStatus: "uploading",
      allowDownload: true
    }
  });

  try {
    const uploaded = await uploadAiStudyObject({
      key: storageKey,
      body: input.body,
      contentType: detected.mimeType
    });
    return await prisma.officialStudyMaterial.update({
      where: { id },
      data: {
        storageBucket: uploaded.bucket,
        storageKey: uploaded.key,
        storagePath: uploaded.storagePath,
        previewText: null,
        previewTruncated: false,
        fileStatus: "ready",
        processingError: null
      },
      include: {
        course: { select: { id: true, name: true } },
        major: { select: { id: true, name: true } },
        publicSubject: { select: { id: true, name: true } },
        createdBy: { select: { id: true, username: true } }
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "资料处理失败。";
    await prisma.officialStudyMaterial.update({
      where: { id },
      data: { fileStatus: "failed", processingError: message.slice(0, 500) }
    });
    throw new OfficialStudyMaterialError("资料上传失败，请稍后重试。", 422, "OFFICIAL_MATERIAL_PROCESSING_FAILED");
  }
}

export async function updateOfficialStudyMaterial(materialId: string, input: unknown) {
  const parsed = updateMaterialSchema.safeParse(input);
  if (!parsed.success) {
    throw new OfficialStudyMaterialError("资料信息不合法。", 400, "OFFICIAL_MATERIAL_INVALID_INPUT");
  }
  await assertActiveMaterial(materialId);
  const scope = await resolveOfficialMaterialScope(parsed.data.scopeType || null, parsed.data.scopeId || null);
  return prisma.officialStudyMaterial.update({
    where: { id: materialId },
    data: {
      title: parsed.data.title,
      description: parsed.data.description?.trim() || null,
      courseId: null,
      majorId: scope.majorId,
      publicSubjectId: scope.publicSubjectId,
      sortOrder: parsed.data.sortOrder
    },
    include: {
      course: { select: { id: true, name: true } },
      major: { select: { id: true, name: true } },
      publicSubject: { select: { id: true, name: true } },
      createdBy: { select: { id: true, username: true } }
    }
  });
}

export async function publishOfficialStudyMaterial(materialId: string) {
  const material = await assertActiveMaterial(materialId);
  if (material.fileStatus !== "ready" || !material.storageKey) {
    throw new OfficialStudyMaterialError("只有文件状态正常的资料才能发布。", 409, "OFFICIAL_MATERIAL_NOT_READY");
  }
  return prisma.officialStudyMaterial.update({
    where: { id: materialId },
    data: {
      visibility: "public",
      publishedAt: material.publishedAt || new Date()
    },
    include: {
      course: { select: { id: true, name: true } },
      major: { select: { id: true, name: true } },
      publicSubject: { select: { id: true, name: true } },
      createdBy: { select: { id: true, username: true } }
    }
  });
}

export async function unpublishOfficialStudyMaterial(materialId: string) {
  await assertActiveMaterial(materialId);
  return prisma.officialStudyMaterial.update({
    where: { id: materialId },
    data: { visibility: "offline" },
    include: {
      course: { select: { id: true, name: true } },
      major: { select: { id: true, name: true } },
      publicSubject: { select: { id: true, name: true } },
      createdBy: { select: { id: true, username: true } }
    }
  });
}

export async function deleteOfficialStudyMaterial(materialId: string) {
  const material = await assertActiveMaterial(materialId);
  if (material.storageKey) {
    try {
      await deleteAiStudyObject(material.storageKey);
    } catch {
      throw new OfficialStudyMaterialError(
        "MinIO 原文件删除失败，数据库记录未删除，请稍后重试。",
        502,
        "OFFICIAL_MATERIAL_STORAGE_DELETE_FAILED"
      );
    }
  }
  return prisma.officialStudyMaterial.delete({ where: { id: materialId } });
}

export async function getAdminOfficialStudyMaterial(materialId: string) {
  const material = await prisma.officialStudyMaterial.findFirst({
    where: { id: materialId, deletedAt: null },
    include: {
      course: { select: { id: true, name: true } },
      major: { select: { id: true, name: true } },
      publicSubject: { select: { id: true, name: true } },
      createdBy: { select: { id: true, username: true } }
    }
  });
  if (!material) {
    throw new OfficialStudyMaterialError("资料不存在或已删除。", 404, "OFFICIAL_MATERIAL_NOT_FOUND");
  }
  return material;
}

export async function getPublicOfficialStudyMaterial(materialId: string, userId: string) {
  const material = await prisma.officialStudyMaterial.findFirst({
    where: {
      id: materialId,
      ...await publicOfficialMaterialWhere(userId),
      AND: [{ OR: [{ diamondPrice: 0 }, { purchases: { some: { userId } } }] }]
    },
    include: {
      course: { select: { id: true, name: true } },
      major: { select: { id: true, name: true } },
      publicSubject: { select: { id: true, name: true } }
    }
  });
  if (!material) {
    throw new OfficialStudyMaterialError("公开资料不存在或已下架。", 404, "OFFICIAL_MATERIAL_NOT_FOUND");
  }
  return material;
}

export function formatOfficialStudyMaterialError(error: unknown) {
  return error instanceof OfficialStudyMaterialError
    ? { message: error.message, status: error.status, code: error.code }
    : null;
}

async function assertActiveMaterial(materialId: string) {
  const material = await prisma.officialStudyMaterial.findFirst({
    where: { id: materialId, deletedAt: null }
  });
  if (!material) {
    throw new OfficialStudyMaterialError("资料不存在或已删除。", 404, "OFFICIAL_MATERIAL_NOT_FOUND");
  }
  return material;
}

async function resolveOfficialMaterialScope(
  scopeType: "major" | "public_subject" | null,
  scopeId: string | null
) {
  if (!scopeType && !scopeId) {
    return { majorId: null, publicSubjectId: null };
  }
  if (!scopeType || !scopeId) {
    throw new OfficialStudyMaterialError("请选择有效的所属课程。", 400, "OFFICIAL_MATERIAL_SCOPE_INVALID");
  }
  if (scopeType === "major") {
    const major = await prisma.major.findFirst({
      where: { id: scopeId, status: "published" },
      select: { id: true }
    });
    if (major) {
      return { majorId: major.id, publicSubjectId: null };
    }
  } else {
    const publicSubject = await prisma.publicSubject.findFirst({
      where: {
        id: scopeId,
        status: "published",
        name: { in: ["大学语文", "高等数学"] }
      },
      select: { id: true }
    });
    if (publicSubject) {
      return { majorId: null, publicSubjectId: publicSubject.id };
    }
  }
  throw new OfficialStudyMaterialError("所选课程不存在或未发布。", 400, "OFFICIAL_MATERIAL_SCOPE_INVALID");
}

function detectOfficialMaterialFile(fileName: string, mimeType: string, body: Buffer) {
  const normalizedName = fileName.toLowerCase();
  if (normalizedName.endsWith(".pdf")) {
    if (body.subarray(0, 5).toString("ascii") !== "%PDF-") {
      throw new OfficialStudyMaterialError("文件内容不是有效的 PDF。", 400, "OFFICIAL_MATERIAL_INVALID_PDF");
    }
    return { fileType: "pdf" as const, mimeType: "application/pdf" };
  }
  throw new OfficialStudyMaterialError(
    `暂不支持此文件类型（${mimeType || "未知类型"}），请上传 PDF。`,
    400,
    "OFFICIAL_MATERIAL_UNSUPPORTED_FILE"
  );
}

function buildDefaultTitle(fileName: string) {
  const title = fileName.replace(/\.[^.]+$/, "").trim();
  return (title || "未命名官方资料").slice(0, 120);
}

function sanitizeFileName(fileName: string) {
  const extension = fileName.toLowerCase().endsWith(".pdf") ? ".pdf" : "";
  const baseName = fileName
    .replace(/\.[^.]+$/, "")
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "material";
  return `${baseName}${extension}`;
}
