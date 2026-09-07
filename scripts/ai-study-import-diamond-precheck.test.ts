import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import {
  assertSufficientDiamondBalanceForRule,
  InsufficientDiamondBalanceError
} from "../src/lib/rewards";

type RuleOptions = {
  amount?: number;
  balance?: number | null;
  direction?: "grant" | "consume";
  enabled?: boolean;
};

function rewardClient(options: RuleOptions = {}) {
  const amount = options.amount ?? 50;
  const balance = options.balance ?? 0;
  const direction = options.direction ?? "consume";
  const enabled = options.enabled ?? true;
  let balanceReads = 0;

  const client = {
    diamondRuleConfig: {
      findUnique: async () => ({
        key: "ai_study_project_create",
        direction,
        amount,
        enabled,
        version: 1
      })
    },
    diamondAccount: {
      findUnique: async () => {
        balanceReads += 1;
        return balance === null ? null : { balance };
      }
    }
  } as unknown as Prisma.TransactionClient;

  return { client, balanceReads: () => balanceReads };
}

test("insufficient balance is rejected with the configured and current amounts", async () => {
  const { client } = rewardClient({ amount: 50, balance: 49 });
  await assert.rejects(
    assertSufficientDiamondBalanceForRule(client, {
      userId: "student",
      ruleKey: "ai_study_project_create"
    }),
    (error: unknown) => {
      assert.ok(error instanceof InsufficientDiamondBalanceError);
      assert.equal(error.requiredAmount, 50);
      assert.equal(error.currentBalance, 49);
      return true;
    }
  );
});

test("an account without a balance row is treated as zero", async () => {
  const { client } = rewardClient({ amount: 50, balance: null });
  await assert.rejects(
    assertSufficientDiamondBalanceForRule(client, {
      userId: "student",
      ruleKey: "ai_study_project_create"
    }),
    (error: unknown) => error instanceof InsufficientDiamondBalanceError
      && error.currentBalance === 0
  );
});

test("a balance equal to the configured amount passes without a debit", async () => {
  const { client, balanceReads } = rewardClient({ amount: 50, balance: 50 });
  await assertSufficientDiamondBalanceForRule(client, {
    userId: "student",
    ruleKey: "ai_study_project_create"
  });
  assert.equal(balanceReads(), 1);
});

test("a disabled consume rule bypasses the balance lookup", async () => {
  const { client, balanceReads } = rewardClient({ enabled: false, balance: null });
  await assertSufficientDiamondBalanceForRule(client, {
    userId: "student",
    ruleKey: "ai_study_project_create"
  });
  assert.equal(balanceReads(), 0);
});

test("a grant rule cannot be used as an import eligibility check", async () => {
  const { client } = rewardClient({ direction: "grant", balance: 100 });
  await assert.rejects(
    assertSufficientDiamondBalanceForRule(client, {
      userId: "student",
      ruleKey: "ai_study_project_create"
    }),
    /Diamond rule is not a consume rule/
  );
});

test("project creation checks import eligibility before writing the draft", () => {
  const source = readFileSync(new URL("../src/lib/ai-study.ts", import.meta.url), "utf8");
  const start = source.indexOf("export async function createAiStudyProject");
  const end = source.indexOf("export async function getAiStudyProject", start);
  const body = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.ok(body.indexOf("await assertAiStudyProjectImportAllowed(ownerId)") >= 0);
  assert.ok(body.indexOf("await assertAiStudyProjectImportAllowed(ownerId)") < body.indexOf("prisma.aiStudyProject.create"));
});

test("source upload checks import eligibility before MinIO storage", () => {
  const source = readFileSync(new URL("../src/lib/ai-study.ts", import.meta.url), "utf8");
  const start = source.indexOf("export async function uploadAiStudySource");
  const end = source.indexOf("export async function startAiStudyProjectGeneration", start);
  const body = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.ok(body.indexOf("await assertAiStudyProjectImportAllowed(ownerId)") >= 0);
  assert.ok(body.indexOf("await assertAiStudyProjectImportAllowed(ownerId)") < body.indexOf("uploadAiStudyObject"));
});
