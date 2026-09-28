import { z } from "zod";
import { apiError, apiOk } from "@/lib/api-response";
import { formatOfficialStudyMaterialError, getPublicOfficialStudyMaterial } from "@/lib/official-study-materials";
import { prisma } from "@/lib/prisma";
import { getStudentApiUser } from "@/lib/student-api";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ materialId: string }>;
};

const progressSchema = z.object({
  pageNumber: z.number().int().min(1).max(100000)
});

export async function GET(_request: Request, context: RouteContext) {
  const { user, response } = await getStudentApiUser();
  if (!user) return response;

  try {
    const { materialId } = await context.params;
    await getPublicOfficialStudyMaterial(materialId, user.id);
    const progress = await prisma.officialStudyMaterialReadProgress.findUnique({
      where: { userId_materialId: { userId: user.id, materialId } },
      select: { pageNumber: true }
    });
    return apiOk({ pageNumber: progress?.pageNumber ?? 1 });
  } catch (error) {
    return materialProgressError(error);
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const { user, response } = await getStudentApiUser();
  if (!user) return response;

  try {
    const body = await request.json().catch(() => null);
    const parsed = progressSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("Invalid page number.", 400, "INVALID_PAGE_NUMBER");
    }

    const { materialId } = await context.params;
    await getPublicOfficialStudyMaterial(materialId, user.id);
    const progress = await prisma.officialStudyMaterialReadProgress.upsert({
      where: { userId_materialId: { userId: user.id, materialId } },
      create: { userId: user.id, materialId, pageNumber: parsed.data.pageNumber },
      update: { pageNumber: parsed.data.pageNumber }
    });
    return apiOk({ pageNumber: progress.pageNumber });
  } catch (error) {
    return materialProgressError(error);
  }
}

function materialProgressError(error: unknown) {
  const formatted = formatOfficialStudyMaterialError(error);
  if (formatted) {
    return apiError(formatted.message, formatted.status, formatted.code);
  }
  throw error;
}
