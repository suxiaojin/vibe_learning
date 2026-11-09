import type { Prisma } from "@prisma/client";
import { consumeDiamondsByRule } from "@/lib/rewards";

export async function reservePastExamAiConversation(tx: Prisma.TransactionClient, input: {
  answer: string; answerSource: string; conversationId: string; purpose: string;
  questionId: string; userId: string; userPrompt: string; chargeFollowUp: boolean;
}) {
  await tx.aiConversation.create({ data: {
    id: input.conversationId, userId: input.userId, questionId: input.questionId,
    purpose: input.purpose, modelName: null, answerSource: input.answerSource,
    messages: [
      { role: "user", content: input.userPrompt },
      { role: "assistant", content: input.answer, source: input.answerSource }
    ]
  } });
  if (input.chargeFollowUp) {
    await consumeDiamondsByRule(tx, {
      userId: input.userId,
      ruleKey: "past_exam_ai_follow_up",
      dedupeKey: `past_exam_ai_follow_up:${input.conversationId}`,
      note: "历年真题：提问",
      metadata: { conversationId: input.conversationId, questionId: input.questionId, promptLength: input.userPrompt.length }
    });
  }
}
