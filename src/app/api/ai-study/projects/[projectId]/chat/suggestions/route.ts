import { apiError, apiOk } from "@/lib/api-response";
import { formatAiStudyError } from "@/lib/ai-study";
import { generateAiStudyChatSuggestions } from "@/lib/ai-study-chat-suggestions";
import { getStudentApiUser } from "@/lib/student-api";

export const runtime = "nodejs";
export const maxDuration = 90;

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
    const nodeId = body && typeof body === "object" && typeof body.nodeId === "string"
      ? body.nodeId.trim()
      : "";
    if (!nodeId) {
      return apiError("知识节点不能为空。", 400, "AI_STUDY_NODE_REQUIRED");
    }
    const { projectId } = await context.params;
    const suggestions = await generateAiStudyChatSuggestions(user.id, projectId, nodeId, request.signal);
    return apiOk({ suggestions });
  } catch (error) {
    const formatted = formatAiStudyError(error);
    if (formatted) {
      return apiError(formatted.message, formatted.status, formatted.code);
    }
    return apiError("推荐问题暂时无法生成。", 503, "AI_STUDY_CHAT_SUGGESTIONS_FAILED");
  }
}
