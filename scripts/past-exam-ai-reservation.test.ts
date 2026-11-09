import assert from "node:assert/strict";
import { test } from "node:test";
import type { Prisma } from "@prisma/client";
import { reservePastExamAiConversation } from "../src/lib/past-exam-ai-reservation";
import { InsufficientDiamondBalanceError } from "../src/lib/rewards";

const input = { userId: "user", questionId: "question", conversationId: "request", purpose: "past_exam_ai_follow_up_pending", userPrompt: "为什么", answer: "", answerSource: "pending", chargeFollowUp: true };
function fixture({ balance = 10, amount = 2, enabled = true } = {}) {
  let committed = { balance, conversations: [] as unknown[], ledger: [] as Array<Record<string, unknown>> };
  async function transaction(data = input) {
    const draft = structuredClone(committed);
    const tx = {
      aiConversation: { create: async ({ data: row }: { data: unknown }) => { draft.conversations.push(row); } },
      diamondTransaction: {
        findUnique: async () => null,
        create: async ({ data: row }: { data: Record<string, unknown> }) => { draft.ledger.push(row); }
      },
      diamondRuleConfig: { findUnique: async () => ({ key: "past_exam_ai_follow_up", direction: "consume", amount, enabled, version: 3 }) },
      diamondAccount: {
        upsert: async () => ({ id: "account", balance: draft.balance }),
        updateMany: async ({ where, data: d }: { where: { balance: { gte: number } }; data: { balance: { decrement: number } } }) => {
          if (draft.balance < where.balance.gte) return { count: 0 };
          draft.balance -= d.balance.decrement; return { count: 1 };
        },
        findUnique: async () => ({ balance: draft.balance }),
        findUniqueOrThrow: async () => ({ balance: draft.balance })
      }
    } as unknown as Prisma.TransactionClient;
    await reservePastExamAiConversation(tx, data);
    committed = draft;
  }
  return { transaction, state: () => committed };
}
test("enabled rule debits configured amount and records metadata with the conversation", async () => {
  const db = fixture({ amount: 4 }); await db.transaction();
  assert.equal(db.state().balance, 6); assert.equal(db.state().conversations.length, 1);
  const row = db.state().ledger[0]; assert.equal(row.amount, -4); assert.equal(row.balanceAfter, 6);
  assert.equal(row.note, "历年真题：提问"); assert.equal(row.dedupeKey, "past_exam_ai_follow_up:request");
  assert.deepEqual(row.metadata, { conversationId: "request", questionId: "question", promptLength: 3, diamondRuleKey: "past_exam_ai_follow_up", diamondRuleVersion: 3, configuredAmount: 4 });
});
test("insufficient balance rolls back conversation and ledger", async () => {
  const db = fixture({ balance: 1 }); await assert.rejects(db.transaction(), InsufficientDiamondBalanceError);
  assert.equal(db.state().balance, 1); assert.equal(db.state().conversations.length, 0); assert.equal(db.state().ledger.length, 0);
});
test("disabled rule and initial explanation create no debit", async () => {
  const disabled = fixture({ enabled: false }); await disabled.transaction();
  assert.equal(disabled.state().balance, 10); assert.equal(disabled.state().ledger.length, 0); assert.equal(disabled.state().conversations.length, 1);
  const initial = fixture(); await initial.transaction({ ...input, chargeFollowUp: false });
  assert.equal(initial.state().balance, 10); assert.equal(initial.state().ledger.length, 0);
});
