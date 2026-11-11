import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { getPastExamOffer, pastExamPurchaseSchema, pastExamScope, purchasePastExam, PastExamPurchaseError } from "../src/lib/past-exam-purchase";
import { InsufficientDiamondBalanceError } from "../src/lib/rewards";
import { getPastExams } from "../src/lib/past-exams";

const input = { courseKey: "major" as const, expectedDiamondPrice: 20, confirmed: true };
function fixture(options: { price?: number; balance?: number; purchased?: boolean; unavailable?: boolean; failWrite?: boolean; conflicts?: number } = {}) {
  let state = { balance: options.balance ?? 100, purchased: options.purchased ?? false, ledger: [] as Record<string, unknown>[], purchases: [] as Record<string, unknown>[] };
  let price = options.price ?? 20;
  let calls = 0;
  let lastWhere: unknown;
  mock.method(prisma, "$transaction", async (work: (tx: unknown) => Promise<unknown>, config: unknown) => {
    assert.deepEqual(config, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    const draft = structuredClone(state);
    calls++;
    const tx = {
      $queryRaw: async () => [],
      studentProfile: { findUnique: async () => ({ regionId: "region", majorId: "major", publicSubjectId: "subject" }) },
      examPaper: { findFirst: async ({ where }: { where: unknown }) => {
        lastWhere = where;
        return options.unavailable ? null : { id: "paper", title: "2026年真题", diamondPrice: price, purchases: draft.purchased ? [{ id: "existing" }] : [] };
      } },
      diamondAccount: {
        upsert: async () => ({ id: "account", balance: draft.balance }),
        updateMany: async ({ where, data }: { where: { balance: { gte: number } }; data: { balance: { decrement: number } } }) => {
          if (draft.balance < where.balance.gte) return { count: 0 };
          draft.balance -= data.balance.decrement;
          return { count: 1 };
        },
        findUniqueOrThrow: async () => ({ balance: draft.balance })
      },
      diamondTransaction: { create: async ({ data }: { data: Record<string, unknown> }) => { draft.ledger.push(data); return { id: "transaction" }; } },
      pastExamPurchase: { create: async ({ data }: { data: Record<string, unknown> }) => {
        if (options.failWrite) throw new Error("purchase write failed");
        draft.purchased = true; draft.purchases.push(data);
      } }
    };
    const result = await work(tx);
    if (calls <= (options.conflicts ?? 0)) throw new Prisma.PrismaClientKnownRequestError("conflict", { code: "P2034", clientVersion: "test" });
    state = draft;
    return result;
  });
  return { state: () => state, price: (value: number) => { price = value; }, calls: () => calls, where: () => lastWhere };
}
test.afterEach(() => mock.restoreAll());

test("purchase stores one entitlement and exact negative ledger atomically", async () => {
  const db = fixture();
  assert.equal((await purchasePastExam("student", "paper", input)).charged, true);
  assert.equal(db.state().balance, 80);
  assert.equal(db.state().ledger[0].amount, -20);
  assert.equal(db.state().ledger[0].balanceAfter, 80);
  assert.equal(db.state().ledger[0].note, "历年真题：购买《2026年真题》");
  assert.equal(db.state().ledger[0].dedupeKey, "past_exam_purchase:student:paper");
  assert.equal(db.state().purchases[0].resourceId, "paper");
});

test("Henan English purchase uses the course-center scope and shares the past-exam entitlement", async () => {
  const db = fixture({ price: 50 });
  const englishInput = pastExamPurchaseSchema.parse({
    courseKey: "public_subject", entry: "henan_english", expectedDiamondPrice: 50, confirmed: true
  });
  const purchase = await purchasePastExam("student", "paper", englishInput);
  assert.equal(purchase.offer.href, "/course-center/english-past-exams/paper");
  assert.equal(purchase.offer.purchased, true);
  assert.deepEqual(db.where(), { AND: [{
    ownerType: "public_subject",
    status: "published",
    region: { province: "河南", studySystem: "三年制", studentProfiles: { some: { userId: "student" } } },
    publicSubject: { name: "公共英语", studentProfiles: { some: { userId: "student" } } },
    questions: { some: { question: { status: "published" } } }
  }, { id: "paper" }] });
  const reopened = await purchasePastExam("student", "paper", {
    courseKey: "public_subject", expectedDiamondPrice: 50, confirmed: false
  });
  assert.equal(reopened.offer.href, "/mock-tests/special/past/paper?course=public_subject");
  assert.equal(reopened.charged, false);
  assert.equal(db.state().balance, 50);
  assert.equal(db.state().ledger.length, 1);
  assert.equal(db.state().purchases.length, 1);
  assert.equal(pastExamPurchaseSchema.safeParse({ ...englishInput, courseKey: "major" }).success, false);
});
test("missing/false confirmation writes nothing", async () => {
  const db = fixture();
  for (const confirmed of [false, undefined]) await assert.rejects(purchasePastExam("student", "paper", { ...input, confirmed }), (e: unknown) => e instanceof PastExamPurchaseError && e.code === "PAST_EXAM_CONFIRMATION_REQUIRED");
  assert.equal(db.state().balance, 100); assert.equal(db.state().ledger.length, 0);
});
test("insufficient balance does not create entitlement or ledger", async () => {
  const db = fixture({ balance: 19 });
  await assert.rejects(purchasePastExam("student", "paper", input), InsufficientDiamondBalanceError);
  assert.equal(db.state().balance, 19); assert.equal(db.state().purchases.length, 0); assert.equal(db.state().ledger.length, 0);
});
test("failed entitlement write rolls back debit and ledger", async () => {
  const db = fixture({ failWrite: true });
  await assert.rejects(purchasePastExam("student", "paper", input), /purchase write failed/);
  assert.equal(db.state().balance, 100); assert.equal(db.state().ledger.length, 0);
});
test("free visit creates no permanent purchase, later price needs confirmation", async () => {
  const db = fixture({ price: 0 });
  await purchasePastExam("student", "paper", { ...input, expectedDiamondPrice: 0, confirmed: false });
  assert.equal(db.state().purchased, false); assert.equal(db.state().ledger.length, 0);
  db.price(20);
  await assert.rejects(purchasePastExam("student", "paper", { ...input, confirmed: false }), PastExamPurchaseError);
});
test("repeated purchase remains free after price increase and at zero balance", async () => {
  const db = fixture({ balance: 20 });
  await purchasePastExam("student", "paper", input);
  db.price(60);
  for (let i = 0; i < 8; i++) assert.equal((await purchasePastExam("student", "paper", { ...input, confirmed: false })).charged, false);
  assert.equal(db.state().balance, 0); assert.equal(db.state().ledger.length, 1);
});
test("repricing including becoming free returns new offer without debit", async () => {
  const db = fixture();
  for (const value of [30, 10, 0]) {
    db.price(value);
    await assert.rejects(purchasePastExam("student", "paper", input), (e: unknown) => e instanceof PastExamPurchaseError && e.code === "PAST_EXAM_PRICE_CHANGED" && e.offer?.diamondPrice === value);
  }
  assert.equal(db.state().balance, 100);
});
test("unavailable resource rejects even existing purchaser", async () => {
  const db = fixture({ unavailable: true, purchased: true });
  await assert.rejects(purchasePastExam("student", "paper", input), (e: unknown) => e instanceof PastExamPurchaseError && e.status === 404);
  assert.equal(db.state().ledger.length, 0);
});
test("serialization retries do not duplicate charges and stop after four attempts", async () => {
  const db = fixture({ conflicts: 2 });
  await purchasePastExam("student", "paper", input);
  assert.equal(db.calls(), 3); assert.equal(db.state().balance, 80); assert.equal(db.state().ledger.length, 1);
  mock.restoreAll();
  const failed = fixture({ conflicts: 5 });
  await assert.rejects(purchasePastExam("student", "paper", input));
  assert.equal(failed.calls(), 4); assert.equal(failed.state().balance, 100);
});
test("scope requires region, selected course, published real exam, visible and nonempty", async () => {
  const db = { studentProfile: { findUnique: async () => ({ regionId: "region", majorId: "major", publicSubjectId: "subject" }) } } as never;
  const major = await pastExamScope("student", "major", db);
  assert.deepEqual(major, { regionId: "region", majorId: "major", ownerType: "major", paperType: "real_exam", status: "published", visibleInPastPractice: true, questions: { some: { question: { status: "published" } } } });
  assert.equal((await pastExamScope("student", "public_subject", db)).publicSubjectId, "subject");
  const missing = await pastExamScope("student", "major", { studentProfile: { findUnique: async () => null } } as never);
  assert.deepEqual(missing.id, { in: [] });
});
test("offer selects only metadata before purchase", async () => {
  let select: Record<string, unknown> = {};
  await getPastExamOffer("student", "major", "paper", {
    studentProfile: { findUnique: async () => ({ regionId: "region", majorId: "major" }) },
    examPaper: { findFirst: async (args: { select: Record<string, unknown> }) => { select = args.select; return { id: "paper", title: "title", diamondPrice: 20, purchases: [] }; } }
  } as never);
  assert.deepEqual(Object.keys(select).sort(), ["diamondPrice", "id", "purchases", "title"]);
});
test("input rejects user spoofing, malformed confirmation and invalid prices", () => {
  for (const extra of [{ userId: "other" }, { confirmed: "true" }, { expectedDiamondPrice: -1 }, { expectedDiamondPrice: 0.5 }, { expectedDiamondPrice: 2147483648 }, { courseKey: "unknown" }]) assert.equal(pastExamPurchaseSchema.safeParse({ ...input, ...extra }).success, false);
});

test("detail and answer submission loader requires free access or current user's purchase", async () => {
  const profileDelegate = prisma.studentProfile;
  const paperDelegate = prisma.examPaper;
  let where: Record<string, unknown> = {};
  Object.defineProperty(prisma, "studentProfile", { configurable: true, value: { findUnique: async () => ({ regionId: "region", majorId: "major", publicSubjectId: "subject", major: { name: "专业", regions: [] }, publicSubject: { name: "公共课" } }) } });
  Object.defineProperty(prisma, "examPaper", { configurable: true, value: { findMany: async (args: { where: Record<string, unknown> }) => { where = args.where; return []; } } });
  try {
  await getPastExams("student", "major", "paper");
  assert.equal(where.id, "paper");
  assert.deepEqual(where.AND, [{ OR: [{ diamondPrice: 0 }, { purchases: { some: { userId: "student" } } }] }]);
  assert.equal(where.regionId, "region"); assert.equal(where.majorId, "major");
  assert.equal(where.status, "published"); assert.equal(where.visibleInPastPractice, true);
  await getPastExams("student", "major");
  assert.equal(where.AND, undefined);
  } finally {
    Object.defineProperty(prisma, "studentProfile", { configurable: true, value: profileDelegate });
    Object.defineProperty(prisma, "examPaper", { configurable: true, value: paperDelegate });
  }
});
