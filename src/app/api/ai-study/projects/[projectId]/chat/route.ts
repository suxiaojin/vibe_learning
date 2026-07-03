import { apiError, apiOk } from "@/lib/api-response";
import { askAiStudyBuddy, formatAiStudyError } from "@/lib/ai-study";
import { getStudentApiUser } from "@/lib/student-api";

export const runtime = "nodejs";
export const maxDuration = 120;

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { user, response } = await getStudentApiUser();
  if (!user) {
    return response;
  }

  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return apiError("Invalid JSON body.", 400, "INVALID_JSON");
    }

    const { projectId } = await context.params;
    const result = await askAiStudyBuddy(user.id, projectId, body);
    return apiOk(result);
  } catch (error) {
    const formatted = formatAiStudyError(error);
    if (formatted) {
      return apiError(formatted.message, formatted.status, formatted.code);
    }

    const message = error instanceof Error ? error.message : "AI 服务暂时不可用";
    return apiError(`AI学习搭子暂时不可用：${message}`, 503, "AI_STUDY_CHAT_FAILED");
  }
}
