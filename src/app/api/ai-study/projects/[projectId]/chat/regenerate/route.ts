import { apiError, apiOk } from "@/lib/api-response";
import { formatAiStudyError, getAiStudyRegenerationQuote, regenerateAiStudyBuddy } from "@/lib/ai-study";
import { getStudentApiUser } from "@/lib/student-api";

export const runtime = "nodejs";
export const maxDuration = 120;

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { user, response } = await getStudentApiUser();
  if (!user) return response;

  try {
    const { projectId } = await context.params;
    return apiOk({ quote: await getAiStudyRegenerationQuote(user.id, projectId) });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  const { user, response } = await getStudentApiUser();
  if (!user) return response;

  try {
    const body = await request.json().catch(() => null);
    if (!body) return apiError("Invalid JSON body.", 400, "INVALID_JSON");
    const { projectId } = await context.params;
    return apiOk(await regenerateAiStudyBuddy(user.id, projectId, body));
  } catch (error) {
    return handleError(error);
  }
}

function handleError(error: unknown) {
  const formatted = formatAiStudyError(error);
  if (formatted) return apiError(formatted.message, formatted.status, formatted.code);
  const message = error instanceof Error ? error.message : "AI 服务暂时不可用";
  return apiError(`重新生成暂时不可用：${message}`, 503, "AI_STUDY_REGENERATION_FAILED");
}
