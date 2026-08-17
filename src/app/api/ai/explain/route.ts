import { apiError, apiOk } from "@/lib/api-response";
import {
  defaultAiExplainSystemPrompt,
  defaultAiExplainUserPromptTemplate,
  formatAiExplainAnswer,
  formatAiExplainOptions,
  renderAiExplainPromptTemplate
} from "@/lib/ai-explain-prompt-template";
import { resolveAiExplainPromptContext } from "@/lib/ai-explain-prompts";
import { getCurrentUser } from "@/lib/auth";
import { canExplainQuestion } from "@/lib/learning";
import { streamQwen } from "@/lib/qwen";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const DEFAULT_PROMPT = "请把这道题用通俗的方式讲解一下。";
const DEFAULT_PURPOSE = "wrong_question_ai_explanation";
const FOLLOW_UP_PURPOSE = "wrong_question_ai_follow_up";
const encoder = new TextEncoder();

type AiAnswerSource = "generated" | "question_cache" | "conversation_cache";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return apiError("Authentication required.", 401, "UNAUTHORIZED");
  }

  const searchParams = new URL(request.url).searchParams;
  const questionId = searchParams.get("questionId")?.trim() || "";
  const sessionId = searchParams.get("sessionId")?.trim() || undefined;
  if (!questionId) {
    return apiError("缺少题目 ID", 400, "MISSING_QUESTION_ID");
  }

  const question = await prisma.question.findUnique({
    where: { id: questionId },
    select: { id: true, status: true }
  });
  if (!question || question.status !== "published") {
    return apiError("题目不存在或未发布", 404, "QUESTION_NOT_FOUND");
  }

  const canExplain = await canExplainQuestion(user.id, question.id);
  if (!canExplain) {
    return apiError("只能查看你自己的错题答疑", 403, "QUESTION_EXPLANATION_FORBIDDEN");
  }

  const promptContext = await resolveAiExplainPromptContext({ userId: user.id, questionId: question.id, sessionId });
  if (!promptContext.validSession) {
    return apiError("答题会话与当前错题不匹配", 403, "QUESTION_EXPLANATION_SESSION_FORBIDDEN");
  }

  const conversations = await prisma.aiConversation.findMany({
    where: {
      userId: user.id,
      questionId: question.id,
      purpose: FOLLOW_UP_PURPOSE,
      ...(promptContext.course
        ? { OR: [{ courseId: promptContext.course.id }, { courseId: null }] }
        : { courseId: null })
    },
    orderBy: { createdAt: "asc" },
    take: 100,
    select: { id: true, messages: true }
  });

  const followUps = conversations.flatMap((conversation) => {
    const followUpQuestion = readConversationMessage(conversation.messages, "user");
    const answer = readConversationMessage(conversation.messages, "assistant");
    return followUpQuestion && answer
      ? [{ id: conversation.id, question: followUpQuestion, answer }]
      : [];
  });

  return apiOk({ followUps });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return apiError("Authentication required.", 401, "UNAUTHORIZED");
  }

  const body = (await request.json().catch(() => null)) as { questionId?: string; prompt?: string; sessionId?: string } | null;
  const questionId = String(body?.questionId || "").trim();
  const prompt = String(body?.prompt || "").trim();
  const sessionId = String(body?.sessionId || "").trim() || undefined;
  if (!questionId) {
    return apiError("缺少题目 ID", 400, "MISSING_QUESTION_ID");
  }

  const question = await prisma.question.findUnique({
    where: { id: questionId },
    include: { knowledgePoint: true }
  });

  if (!question || question.status !== "published") {
    return apiError("题目不存在或未发布", 404, "QUESTION_NOT_FOUND");
  }

  const canExplain = await canExplainQuestion(user.id, question.id);
  if (!canExplain) {
    return apiError("只能讲解你自己的错题", 403, "QUESTION_EXPLANATION_FORBIDDEN");
  }

  const promptContext = await resolveAiExplainPromptContext({ userId: user.id, questionId: question.id, sessionId });
  if (!promptContext.validSession) {
    return apiError("答题会话与当前错题不匹配", 403, "QUESTION_EXPLANATION_SESSION_FORBIDDEN");
  }
  const promptVersion = promptContext.promptVersion;

  const cachedAnswer = question.aiDoubtAnswer?.trim();
  if (!prompt && cachedAnswer) {
    const viewed = await prisma.aiConversation.findFirst({
      where: {
        userId: user.id,
        questionId: question.id,
        purpose: DEFAULT_PURPOSE,
        ...(promptContext.course
          ? { OR: [{ courseId: promptContext.course.id }, { courseId: null }] }
          : { courseId: null })
      },
      select: { id: true }
    });

    return streamCachedAnswer({
      answer: cachedAnswer,
      source: "question_cache",
      onComplete: viewed
        ? undefined
        : () => recordAiConversation({
            userId: user.id,
            questionId: question.id,
            courseId: promptContext.course?.id || null,
            promptVersionId: null,
            purpose: DEFAULT_PURPOSE,
            userPrompt: DEFAULT_PROMPT,
            answer: cachedAnswer,
            source: "question_cache"
          })
    });
  }

  if (!prompt) {
    const cacheValidAfter = promptContext.cacheInvalidatedAt && promptContext.cacheInvalidatedAt > question.updatedAt
      ? promptContext.cacheInvalidatedAt
      : question.updatedAt;
    const savedConversation = await prisma.aiConversation.findFirst({
      where: {
        userId: user.id,
        questionId: question.id,
        purpose: DEFAULT_PURPOSE,
        createdAt: { gte: cacheValidAfter },
        ...(promptContext.course
          ? { OR: [{ courseId: promptContext.course.id }, { courseId: null }] }
          : { courseId: null })
      },
      orderBy: { createdAt: "desc" },
      select: { messages: true }
    });
    const savedAnswer = readConversationMessage(savedConversation?.messages, "assistant");
    if (savedAnswer) {
      return streamCachedAnswer({ answer: savedAnswer, source: "conversation_cache" });
    }
  }

  const userPrompt = prompt || DEFAULT_PROMPT;
  const system = promptVersion?.systemPrompt || defaultAiExplainSystemPrompt;
  const context = renderAiExplainPromptTemplate(
    promptVersion?.userPromptTemplate || defaultAiExplainUserPromptTemplate,
    {
      courseName: promptContext.course?.name || "未识别课程",
      knowledgePointTitle: question.knowledgePoint?.title || "未打标",
      knowledgePointSummary: question.knowledgePoint?.summary || "",
      knowledgePointContent: question.knowledgePoint?.content || "",
      questionStem: question.stem,
      options: formatAiExplainOptions(question.options),
      correctAnswer: formatAiExplainAnswer(question.answer),
      analysis: question.analysis,
      adminAiDoubtAnswer: question.aiDoubtAnswer || "无",
      studentQuestion: userPrompt
    }
  );

  return createTextStream("generated", async (push) => {
    let emitted = false;
    const answer = await streamQwen(
      [
        { role: "system", content: system },
        { role: "user", content: context }
      ],
      async (chunk) => {
        emitted = true;
        await push(chunk);
      },
      {
        signal: request.signal,
        temperature: prompt ? 0.35 : 0.4,
        timeoutMs: 60_000
      }
    );

    if (!emitted) {
      await push(answer);
    }

    await recordAiConversation({
      userId: user.id,
      questionId: question.id,
      courseId: promptContext.course?.id || null,
      promptVersionId: promptVersion?.id || null,
      purpose: prompt ? FOLLOW_UP_PURPOSE : DEFAULT_PURPOSE,
      userPrompt,
      answer,
      source: "generated"
    });
  });
}

function streamCachedAnswer({
  answer,
  onComplete,
  source
}: {
  answer: string;
  onComplete?: () => Promise<void>;
  source: Extract<AiAnswerSource, "question_cache" | "conversation_cache">;
}) {
  return createTextStream(source, async (push) => {
    const chunks = answer.match(/[\s\S]{1,12}/g) || [answer];
    for (const chunk of chunks) {
      await push(chunk);
      await sleep(18);
    }
    await onComplete?.();
  });
}

function createTextStream(source: AiAnswerSource, work: (push: (chunk: string) => Promise<void>) => Promise<void>) {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        await work(async (chunk) => {
          controller.enqueue(encoder.encode(chunk));
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "AI 服务暂时不可用";
        controller.enqueue(encoder.encode(`\n\nAI 服务暂时不可用：${message}`));
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
      "X-AI-Answer-Source": source
    }
  });
}

function readConversationMessage(messages: unknown, role: "user" | "assistant") {
  if (!Array.isArray(messages)) {
    return "";
  }

  const message = messages.find((item) => {
    return typeof item === "object" && item !== null && "role" in item && item.role === role;
  });
  if (!message || typeof message !== "object" || !("content" in message) || typeof message.content !== "string") {
    return "";
  }
  return message.content.trim();
}

async function recordAiConversation({
  answer,
  courseId,
  promptVersionId,
  purpose,
  questionId,
  source,
  userId,
  userPrompt
}: {
  answer: string;
  courseId: string | null;
  promptVersionId: string | null;
  purpose: string;
  questionId: string;
  source: string;
  userId: string;
  userPrompt: string;
}) {
  try {
    await prisma.aiConversation.create({
      data: {
        userId,
        questionId,
        courseId,
        aiPromptVersionId: promptVersionId,
        purpose,
        modelName: source === "generated" ? process.env.QWEN_MODEL || null : null,
        answerSource: source,
        messages: [
          { role: "user", content: userPrompt },
          { role: "assistant", content: answer, source }
        ]
      }
    });
  } catch (error) {
    console.error("Failed to record wrong-question AI explanation.", error);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
