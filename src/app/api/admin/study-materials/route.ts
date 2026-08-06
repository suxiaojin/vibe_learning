import { getCurrentAdmin } from "@/lib/auth";
import {
  createOfficialStudyMaterial,
  formatOfficialStudyMaterialError
} from "@/lib/official-study-materials";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return jsonError("请先登录管理后台。", 401, "ADMIN_AUTH_REQUIRED");
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!isUploadFile(file)) {
      return jsonError("请选择 PDF 文件。", 400, "OFFICIAL_MATERIAL_FILE_REQUIRED");
    }
    const body = Buffer.from(await file.arrayBuffer());
    const material = await createOfficialStudyMaterial(admin.id, {
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      body
    });
    return Response.json({ ok: true, data: { material } }, { status: 201 });
  } catch (error) {
    const formatted = formatOfficialStudyMaterialError(error);
    if (formatted) {
      return jsonError(formatted.message, formatted.status, formatted.code);
    }
    throw error;
  }
}

function isUploadFile(value: FormDataEntryValue | null): value is File {
  return Boolean(value && typeof value === "object" && "arrayBuffer" in value && "name" in value && "size" in value);
}

function jsonError(message: string, status: number, code: string) {
  return Response.json({ ok: false, error: { code, message } }, { status });
}
