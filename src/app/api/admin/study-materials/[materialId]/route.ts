import { getCurrentAdmin } from "@/lib/auth";
import {
  deleteOfficialStudyMaterial,
  formatOfficialStudyMaterialError,
  publishOfficialStudyMaterial,
  unpublishOfficialStudyMaterial,
  updateOfficialStudyMaterial
} from "@/lib/official-study-materials";

type RouteContext = { params: Promise<{ materialId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return jsonError("请先登录管理后台。", 401, "ADMIN_AUTH_REQUIRED");
  }
  try {
    const { materialId } = await context.params;
    const body = await request.json().catch(() => ({})) as { action?: string } & Record<string, unknown>;
    const action = String(body.action || "update");
    const material = action === "publish"
      ? await publishOfficialStudyMaterial(materialId)
      : action === "unpublish"
        ? await unpublishOfficialStudyMaterial(materialId)
        : await updateOfficialStudyMaterial(materialId, body);
    return Response.json({ ok: true, data: { material } });
  } catch (error) {
    const formatted = formatOfficialStudyMaterialError(error);
    if (formatted) {
      return jsonError(formatted.message, formatted.status, formatted.code);
    }
    throw error;
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return jsonError("请先登录管理后台。", 401, "ADMIN_AUTH_REQUIRED");
  }
  try {
    const { materialId } = await context.params;
    await deleteOfficialStudyMaterial(materialId);
    return Response.json({ ok: true, data: { materialId } });
  } catch (error) {
    const formatted = formatOfficialStudyMaterialError(error);
    if (formatted) {
      return jsonError(formatted.message, formatted.status, formatted.code);
    }
    throw error;
  }
}

function jsonError(message: string, status: number, code: string) {
  return Response.json({ ok: false, error: { code, message } }, { status });
}
