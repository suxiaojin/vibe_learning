import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
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
import { canExplainAttemptedQuestion } from "@/lib/learning";
import { streamQwen } from "@/lib/qwen";
import { prisma } from "@/lib/prisma";
import { consumeDiamondsByRule, InsufficientDiamondBalanceError } from "@/lib/rewards";

export const runtime = "nodejs";

const DEFAULT_PROMPT = "请把这道题用通俗的方式讲解一下。";
const DEFAULT_PURPOSE = "wrong_question_ai_explanation";
const DEFAULT_PENDING_PURPOSE = "wrong_question_ai_explanation_pending";
const FOLLOW_UP_PURPOSE = "wrong_question_ai_follow_up";
const FOLLOW_UP_PENDING_PURPOSE = "wrong_question_ai_follow_up_pending";
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

  const canExplain = await canExplainAttemptedQuestion(user.id, question.id);
  if (!canExplain) {
    return apiError("只能查看你自己已作答题目的答疑", 403, "QUESTION_EXPLANATION_FORBIDDEN");
  }

  const promptContext = await resolveAiExplainPromptContext({ userId: user.id, questionId: question.id, sessionId });
  if (!promptContext.validSession) {
    return apiError("答题会话与当前题目不匹配", 403, "QUESTION_EXPLANATION_SESSION_FORBIDDEN");
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

  const body = (await request.json().catch(() => null)) as {
    questionId?: string;
    prompt?: string;
    requestId?: string;
    sessionId?: string;
  } | null;
  const questionId = String(body?.questionId || "").trim();
  const prompt = String(body?.prompt || "").trim();
  const requestId = normalizeRequestId(body?.requestId);
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

  const canExplain = await canExplainAttemptedQuestion(user.id, question.id);
  if (!canExplain) {
    return apiError("只能讲解你自己已作答的题目", 403, "QUESTION_EXPLANATION_FORBIDDEN");
  }

  const promptContext = await resolveAiExplainPromptContext({ userId: user.id, questionId: question.id, sessionId });
  if (!promptContext.validSession) {
    return apiError("答题会话与当前题目不匹配", 403, "QUESTION_EXPLANATION_SESSION_FORBIDDEN");
  }
  const promptVersion = promptContext.promptVersion;

  const cachedAnswer = question.aiDoubtAnswer?.trim();
  if (!prompt && cachedAnswer) {
    const [priorExplanation, viewed] = await Promise.all([
      prisma.aiConversation.findFirst({
        where: {
          userId: user.id,
          questionId: question.id,
          purpose: { in: [DEFAULT_PURPOSE, DEFAULT_PENDING_PURPOSE] }
        },
        select: { id: true }
      }),
      prisma.aiConversation.findFirst({
        where: {
          userId: user.id,
          questionId: question.id,
          purpose: DEFAULT_PURPOSE,
          ...(promptContext.course
            ? { OR: [{ courseId: promptContext.course.id }, { courseId: null }] }
            : { courseId: null })
        },
        select: { id: true }
      })
    ]);

    if (!viewed) {
      const conversationId = priorExplanation
        ? randomUUID()
        : createInitialExplanationConversationId(user.id, question.id);
      const response = await reserveAiConversationOrError({
        answer: cachedAnswer,
        answerSource: "question_cache",
        charge: priorExplanation
          ? undefined
          : {
              dedupeKey: `wrong_question_ai_explanation:${user.id}:${question.id}`,
              metadata: buildDiamondMetadata({
                answerSource: "question_cache",
                conversationId,
                courseId: promptContext.course?.id,
                questionId: question.id,
                sessionId
              }),
              note: "错题答疑：AI解释",
              ruleKey: "wrong_question_ai_explanation"
            },
        conversationId,
        courseId: promptContext.course?.id || null,
        promptVersionId: null,
        purpose: DEFAULT_PURPOSE,
        questionId: question.id,
        userId: user.id,
        userPrompt: DEFAULT_PROMPT
      });
      if (response) {
        return response;
      }
    }

    return streamCachedAnswer({
      answer: cachedAnswer,
      source: "question_cache"
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
  const priorExplanation = prompt
    ? null
    : await prisma.aiConversation.findFirst({
        where: {
          userId: user.id,
          questionId: question.id,
          purpose: { in: [DEFAULT_PURPOSE, DEFAULT_PENDING_PURPOSE] }
        },
        select: { id: true }
      });
  const conversationId = prompt
    ? requestId || randomUUID()
    : priorExplanation
      ? randomUUID()
      : createInitialExplanationConversationId(user.id, question.id);

  if (prompt && requestId) {
    const replay = await getAiConversationReplayResponse({
      conversationId,
      purpose: FOLLOW_UP_PURPOSE,
      pendingPurpose: FOLLOW_UP_PENDING_PURPOSE,
      questionId: question.id,
      userId: user.id
    });
    if (replay) {
      return replay;
    }
  }

  const reservationError = await reserveAiConversationOrError({
    answer: "",
    answerSource: "pending",
    charge: prompt
      ? {
          dedupeKey: `wrong_question_ai_follow_up:${conversationId}`,
          metadata: buildDiamondMetadata({
            conversationId,
            courseId: promptContext.course?.id,
            promptLength: prompt.length,
            questionId: question.id,
            sessionId
          }),
          note: "错题答疑：追问",
          ruleKey: "wrong_question_ai_follow_up"
        }
      : priorExplanation
        ? undefined
        : {
            dedupeKey: `wrong_question_ai_explanation:${user.id}:${question.id}`,
            metadata: buildDiamondMetadata({
              answerSource: "generated",
              conversationId,
              courseId: promptContext.course?.id,
              questionId: question.id,
              sessionId
            }),
            note: "错题答疑：AI解释",
            ruleKey: "wrong_question_ai_explanation"
          },
    conversationId,
    courseId: promptContext.course?.id || null,
    promptVersionId: promptVersion?.id || null,
    purpose: prompt ? FOLLOW_UP_PENDING_PURPOSE : DEFAULT_PENDING_PURPOSE,
    questionId: question.id,
    userId: user.id,
    userPrompt
  });
  if (reservationError) {
    return reservationError;
  }

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

    await completeAiConversation({
      answer,
      conversationId,
      purpose: prompt ? FOLLOW_UP_PURPOSE : DEFAULT_PURPOSE,
      userPrompt
    });
  });
}

function streamCachedAnswer({
  answer,
  source
}: {
  answer: string;
  source: Extract<AiAnswerSource, "question_cache" | "conversation_cache">;
}) {
  return createTextStream(source, async (push) => {
    const chunks = answer.match(/[\s\S]{1,12}/g) || [answer];
    for (const chunk of chunks) {
      await push(chunk);
      await sleep(18);
    }
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

function normalizeRequestId(value: unknown) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return /^[A-Za-z0-9_-]{1,100}$/.test(normalized) ? normalized : "";
}

function createInitialExplanationConversationId(userId: string, questionId: string) {
  const digest = createHash("sha256").update(`${userId}:${questionId}`).digest("hex").slice(0, 32);
  return `ai-explain-${digest}`;
}

function buildDiamondMetadata(input: {
  answerSource?: string;
  conversationId: string;
  courseId?: string;
  promptLength?: number;
  questionId: string;
  sessionId?: string;
}): Prisma.InputJsonObject {
  return {
    conversationId: input.conversationId,
    questionId: input.questionId,
    ...(input.answerSource ? { answerSource: input.answerSource } : {}),
    ...(input.courseId ? { courseId: input.courseId } : {}),
    ...(typeof input.promptLength === "number" ? { promptLength: input.promptLength } : {}),
    ...(input.sessionId ? { sessionId: input.sessionId } : {})
  };
}

async function reserveAiConversationOrError({
  answer,
  answerSource,
  charge,
  conversationId,
  courseId,
  promptVersionId,
  purpose,
  questionId,
  userId,
  userPrompt
}: {
  answer: string;
  answerSource: string;
  charge?: {
    dedupeKey: string;
    metadata: Prisma.InputJsonObject;
    note: string;
    ruleKey: "wrong_question_ai_explanation" | "wrong_question_ai_follow_up";
  };
  conversationId: string;
  courseId: string | null;
  promptVersionId: string | null;
  purpose: string;
  questionId: string;
  userId: string;
  userPrompt: string;
}): Promise<Response | null> {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.aiConversation.create({
        data: {
          id: conversationId,
          userId,
          questionId,
          courseId,
          aiPromptVersionId: promptVersionId,
          purpose,
          modelName: null,
          answerSource,
          messages: [
            { role: "user", content: userPrompt },
            { role: "assistant", content: answer, source: answerSource }
          ]
        }
      });

      if (charge) {
        await consumeDiamondsByRule(tx, {
          userId,
          ruleKey: charge.ruleKey,
          dedupeKey: charge.dedupeKey,
          note: charge.note,
          metadata: charge.metadata
        });
      }
    });
    return null;
  } catch (error) {
    if (error instanceof InsufficientDiamondBalanceError) {
      return apiError("钻石不足，请充值后再试。", 402, "AI_EXPLAIN_INSUFFICIENT_DIAMONDS");
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const replay = await getAiConversationReplayResponse({
        conversationId,
        purpose: purpose === FOLLOW_UP_PENDING_PURPOSE ? FOLLOW_UP_PURPOSE : DEFAULT_PURPOSE,
        pendingPurpose: purpose,
        questionId,
        userId
      });
      if (replay) {
        return replay;
      }
    }
    throw error;
  }
}

async function getAiConversationReplayResponse({
  conversationId,
  pendingPurpose,
  purpose,
  questionId,
  userId
}: {
  conversationId: string;
  pendingPurpose: string;
  purpose: string;
  questionId: string;
  userId: string;
}): Promise<Response | null> {
  const conversation = await prisma.aiConversation.findUnique({
    where: { id: conversationId },
    select: { messages: true, purpose: true, questionId: true, userId: true }
  });
  if (!conversation) {
    return null;
  }
  if (conversation.userId !== userId || conversation.questionId !== questionId) {
    return apiError("AI 请求标识冲突，请重新提交。", 409, "AI_EXPLAIN_REQUEST_ID_CONFLICT");
  }

  const answer = readConversationMessage(conversation.messages, "assistant");
  if (conversation.purpose === purpose && answer) {
    return streamCachedAnswer({ answer, source: "conversation_cache" });
  }
  if (conversation.purpose === pendingPurpose) {
    return apiError("AI 请求正在处理中，请稍后再试。", 409, "AI_EXPLAIN_REQUEST_IN_PROGRESS");
  }
  return apiError("AI 请求标识冲突，请重新提交。", 409, "AI_EXPLAIN_REQUEST_ID_CONFLICT");
}

async function completeAiConversation({
  answer,
  conversationId,
  purpose,
  userPrompt
}: {
  answer: string;
  conversationId: string;
  purpose: string;
  userPrompt: string;
}) {
  try {
    await prisma.aiConversation.update({
      where: { id: conversationId },
      data: {
        purpose,
        modelName: process.env.QWEN_MODEL || null,
        answerSource: "generated",
        messages: [
          { role: "user", content: userPrompt },
          { role: "assistant", content: answer, source: "generated" }
        ]
      }
    });
  } catch (error) {
    console.error("Failed to complete wrong-question AI explanation.", error);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
