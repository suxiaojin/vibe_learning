import { apiError, apiOk } from "@/lib/api-response";
import { getStudentApiUser } from "@/lib/student-api";
import { AiStudyOverviewRequestError, getAiStudyOverviewStatus, requestAiStudyOverview } from "@/lib/ai-study-overview-jobs";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ nodeId: string }> }) {
  const { user, response } = await getStudentApiUser();
  if (!user) return response;
  const { nodeId } = await context.params;
  try {
    return apiOk(await getAiStudyOverviewStatus(user.id, nodeId));
  } catch (error) {
    if (error instanceof AiStudyOverviewRequestError) return apiError(error.message, error.status, error.code);
    throw error;
  }
}

export async function POST(request: Request, context: { params: Promise<{ nodeId: string }> }) {
  const { user, response } = await getStudentApiUser();
  if (!user) return response;
  const body = await request.json().catch(() => null);
  if (!body || typeof body.retry !== "boolean") return apiError("请求参数不合法。", 400, "INVALID_INPUT");
  const { nodeId } = await context.params;
  try {
    return apiOk({ job: await requestAiStudyOverview(user.id, nodeId, body.retry) });
  } catch (error) {
    if (error instanceof AiStudyOverviewRequestError) return apiError(error.message, error.status, error.code);
    throw error;
  }
}
