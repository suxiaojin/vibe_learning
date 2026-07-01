import { apiError, apiOk } from "@/lib/api-response";
import { formatAiStudyError, getAiStudyNodeDetail } from "@/lib/ai-study";
import { getStudentApiUser } from "@/lib/student-api";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ nodeId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { user, response } = await getStudentApiUser();
  if (!user) {
    return response;
  }

  try {
    const { nodeId } = await context.params;
    const node = await getAiStudyNodeDetail(user.id, nodeId);
    return apiOk({ node });
  } catch (error) {
    return aiStudyApiError(error);
  }
}

function aiStudyApiError(error: unknown) {
  const formatted = formatAiStudyError(error);
  if (formatted) {
    return apiError(formatted.message, formatted.status, formatted.code);
  }
  throw error;
}
