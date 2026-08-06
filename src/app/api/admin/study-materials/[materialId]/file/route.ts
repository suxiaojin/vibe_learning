import { getCurrentAdmin } from "@/lib/auth";
import { createOfficialStudyMaterialFileResponse } from "@/lib/official-study-material-response";
import {
  formatOfficialStudyMaterialError,
  getAdminOfficialStudyMaterial
} from "@/lib/official-study-materials";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ materialId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return jsonError("请先登录管理后台。", 401, "ADMIN_AUTH_REQUIRED");
  }
  try {
    const { materialId } = await context.params;
    const material = await getAdminOfficialStudyMaterial(materialId);
    const download = new URL(request.url).searchParams.get("download") === "1";
    return createOfficialStudyMaterialFileResponse(material, { download, admin: true });
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
