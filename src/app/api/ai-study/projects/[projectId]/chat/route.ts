import { apiError, apiOk } from "@/lib/api-response";
import {
  askAiStudyBuddy,
  createAiStudyChatMessage,
  formatAiStudyError,
  listAiStudyChatMessages,
  sanitizeAiStudyBuddyAnswer,
  streamAiStudyBuddy
} from "@/lib/ai-study";
import { getStudentApiUser } from "@/lib/student-api";

export const runtime = "nodejs";
export const maxDuration = 120;

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

const encoder = new TextEncoder();

export async function GET(request: Request, context: RouteContext) {
  const { user, response } = await getStudentApiUser();
  if (!user) {
    return response;
  }

  try {
    const { projectId } = await context.params;
    const searchParams = new URL(request.url).searchParams;
    const nodeId = searchParams.get("nodeId");
    const messages = await listAiStudyChatMessages(user.id, projectId, nodeId);
    return apiOk({ messages });
  } catch (error) {
    const formatted = formatAiStudyError(error);
    if (formatted) {
      return apiError(formatted.message, formatted.status, formatted.code);
    }

    const message = error instanceof Error ? error.message : "AI 服务暂时不可用";
    return apiError(`AI学习搭子历史记录暂时不可用：${message}`, 503, "AI_STUDY_CHAT_HISTORY_FAILED");
  }
}

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
    const chatRequest = parseChatRequestBody(body);
    if (!chatRequest.message) {
      return apiError("对话内容不能为空。", 400, "AI_STUDY_CHAT_MESSAGE_EMPTY");
    }
    if (chatRequest.message.length > 1000) {
      return apiError("对话内容不能超过 1000 个字。", 400, "AI_STUDY_CHAT_MESSAGE_TOO_LONG");
    }

    if (acceptsTextStream(request)) {
      return createTextStream(async (push) => {
        await createAiStudyChatMessage(user.id, projectId, chatRequest.nodeId, "user", chatRequest.message);

        let rawAnswer = "";
        try {
          const result = await streamAiStudyBuddy(
            user.id,
            projectId,
            chatRequest,
            async (chunk) => {
              rawAnswer += chunk;
              await push(chunk);
            },
            { signal: request.signal }
          );
          rawAnswer = result.answer || rawAnswer;
        } finally {
          const answer = sanitizeAiStudyBuddyAnswer(rawAnswer);
          if (answer) {
            await createAiStudyChatMessage(user.id, projectId, chatRequest.nodeId, "assistant", answer);
          }
        }
      });
    }

    await createAiStudyChatMessage(user.id, projectId, chatRequest.nodeId, "user", chatRequest.message);
    const result = await askAiStudyBuddy(user.id, projectId, chatRequest);
    await createAiStudyChatMessage(user.id, projectId, chatRequest.nodeId, "assistant", result.answer);
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

function acceptsTextStream(request: Request) {
  return request.headers.get("Accept")?.includes("text/plain") || request.headers.get("X-AI-Study-Stream") === "1";
}

function parseChatRequestBody(body: unknown) {
  const source = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const message = typeof source.message === "string" ? source.message.trim() : "";
  const nodeId = typeof source.nodeId === "string" && source.nodeId.trim() ? source.nodeId.trim() : null;
  return { message, nodeId };
}

function createTextStream(work: (push: (chunk: string) => Promise<void>) => Promise<void>) {
  let canceled = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        await work(async (chunk) => {
          if (!canceled) {
            controller.enqueue(encoder.encode(chunk));
          }
        });
      } catch (error) {
        if (!canceled) {
          const formatted = formatAiStudyError(error);
          const message = formatted?.message || (error instanceof Error ? error.message : "AI 服务暂时不可用");
          controller.enqueue(encoder.encode(`\nAI学习搭子暂时不可用：${message}`));
        }
      } finally {
        if (!canceled) {
          controller.close();
        }
      }
    },
    cancel() {
      canceled = true;
    }
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-store, no-transform",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Accel-Buffering": "no"
    }
  });
}
