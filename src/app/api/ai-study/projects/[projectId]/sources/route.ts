import { apiError, apiOk } from "@/lib/api-response";
import { formatAiStudyError, uploadAiStudySource } from "@/lib/ai-study";
import { getStudentApiUser } from "@/lib/student-api";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { user, response } = await getStudentApiUser();
  if (!user) {
    return response;
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") || formData.get("source");
    if (!isUploadFile(file)) {
      return apiError("Please upload a PDF file.", 400, "AI_STUDY_FILE_REQUIRED");
    }

    const { projectId } = await context.params;
    const body = Buffer.from(await file.arrayBuffer());
    const result = await uploadAiStudySource(user.id, projectId, {
      fileName: file.name,
      mimeType: file.type || getFallbackMimeType(file.name),
      size: file.size,
      body,
      startParsing: shouldStartParsing(formData)
    });

    return apiOk(result, { status: 201 });
  } catch (error) {
    return aiStudyApiError(error);
  }
}

function isUploadFile(value: FormDataEntryValue | null): value is File {
  return Boolean(value && typeof value === "object" && "arrayBuffer" in value && "name" in value && "size" in value);
}

function shouldStartParsing(formData: FormData) {
  const value = String(formData.get("startParsing") || "").toLowerCase();
  return value !== "false" && value !== "0" && value !== "no";
}

function getFallbackMimeType(fileName: string) {
  const normalized = fileName.toLowerCase();
  if (normalized.endsWith(".pdf")) {
    return "application/pdf";
  }
  return "application/octet-stream";
}

function aiStudyApiError(error: unknown) {
  const formatted = formatAiStudyError(error);
  if (formatted) {
    return apiError(formatted.message, formatted.status, formatted.code);
  }
  throw error;
}
