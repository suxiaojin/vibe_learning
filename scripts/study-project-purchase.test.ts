import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { accessibleAiStudyProjectWhere, getStudyProjectOffer, publicOfficialMaterialWhere, StudyProjectAccessError } from "../src/lib/study-project-access";
import { purchaseStudyProject, studyProjectPurchaseSchema, StudyProjectPriceChangedError, StudyProjectConfirmationRequiredError } from "../src/lib/study-project-purchase";
import { InsufficientDiamondBalanceError } from "../src/lib/rewards";
import { adminProjectPurchasersSchema, listAdminProjectPurchasers } from "../src/lib/admin-study-project-purchases";

type Row = Record<string, unknown>;
type State = {
  price: number;
  balance: number | null;
  ownerId: string;
  visibility: string;
  status: string;
  deletedAt: Date | null;
  majorId: string | null;
  publicSubjectId: string | null;
  profile: { majorId: string | null; publicSubjectId: string | null } | null;
  purchases: Row[];
  ledger: Row[];
};

// Model the queried predicates and atomic rollback without connecting to any database.
function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (value === undefined) return true;
    if (key === "OR") return (value as Row[]).some((condition) => matches(row, condition));
    if (key === "AND") return (value as Row[]).every((condition) => matches(row, condition));
    if (value && typeof value === "object" && "some" in value) {
      return (row[key] as Row[]).some((item) => matches(item, (value as { some: Row }).some));
    }
    return row[key] === value;
  });
}

function fixture(overrides: Partial<State> = {}, options: { failPurchase?: boolean; conflicts?: number } = {}) {
  let state: State = {
    price: 50, balance: 100, ownerId: "creator", visibility: "public", status: "ready",
    deletedAt: null, majorId: null, publicSubjectId: null, profile: null, purchases: [], ledger: [], ...overrides
  };
  let attempts = 0;
  let tail = Promise.resolve();
  const transaction = async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>, config: unknown) => {
    assert.deepEqual(config, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    const before = tail;
    let release = () => {};
    tail = new Promise<void>((resolve) => { release = resolve; });
    await before;
    const draft = structuredClone(state);
    attempts += 1;
    const findResource = (kind: string) => async ({ where }: { where: Row }) => {
      const row = {
        id: "resource", title: "基础会计学", diamondPrice: draft.price,
        ...(kind === "ai" ? { ownerId: draft.ownerId } : {}),
        visibility: draft.visibility, status: draft.status, fileStatus: draft.status, deletedAt: draft.deletedAt,
        majorId: draft.majorId, publicSubjectId: draft.publicSubjectId,
        purchases: draft.purchases.filter((purchase) => purchase.kind === kind && purchase.userId === "student")
      };
      return matches(row, where) ? row : null;
    };
    const tx = {
      $queryRaw: async () => [{ id: "resource" }],
      aiStudyProject: { findFirst: findResource("ai") },
      officialStudyMaterial: { findFirst: findResource("official") },
      studentProfile: { findUnique: async () => draft.profile },
      diamondAccount: {
        upsert: async () => {
          draft.balance ??= 0;
          return { id: "account", balance: draft.balance };
        },
        updateMany: async ({ where, data }: { where: { balance: { gte: number } }; data: { balance: { decrement: number } } }) => {
          if ((draft.balance ?? 0) < where.balance.gte) return { count: 0 };
          draft.balance! -= data.balance.decrement;
          return { count: 1 };
        },
        findUniqueOrThrow: async () => ({ balance: draft.balance })
      },
      diamondTransaction: {
        create: async ({ data }: { data: Row }) => {
          draft.ledger.push(data);
          return { id: `ledger-${draft.ledger.length}` };
        }
      },
      studyProjectPurchase: {
        create: async ({ data }: { data: Row }) => {
          if (options.failPurchase) throw new Error("purchase write failed");
          draft.purchases.push(data);
        }
      }
    } as unknown as Prisma.TransactionClient;
    try {
      const result = await callback(tx);
      if (attempts <= (options.conflicts ?? 0)) {
        throw new Prisma.PrismaClientKnownRequestError("serialization conflict", { code: "P2034", clientVersion: "test" });
      }
      state = draft;
      return result;
    } finally {
      release();
    }
  };
  mock.method(prisma, "$transaction", transaction as typeof prisma.$transaction);
  return {
    state: () => state,
    attempts: () => attempts,
    set: (values: Partial<State>) => { Object.assign(state, values); }
  };
}

const ai = { kind: "ai" as const, id: "resource", expectedDiamondPrice: 50, confirmed: true };
const official = { ...ai, kind: "official" as const };

test.afterEach(() => mock.restoreAll());

test("paid requests without explicit confirmation never debit or create records", async () => {
  const db = fixture();
  for (const kind of ["ai", "official"] as const) {
    for (const confirmed of [undefined, false]) {
      await assert.rejects(purchaseStudyProject("student", { ...ai, kind, confirmed }), StudyProjectConfirmationRequiredError);
    }
  }
  assert.equal(db.state().balance, 100);
  assert.equal(db.state().purchases.length, 0);
  assert.equal(db.state().ledger.length, 0);
});

test("free, owned and already-purchased resources do not require confirmation", async () => {
  const db = fixture({ price: 0 });
  assert.equal((await purchaseStudyProject("student", { ...ai, expectedDiamondPrice: 0, confirmed: false })).charged, false);
  db.set({ price: 50, ownerId: "student" });
  assert.equal((await purchaseStudyProject("student", { ...ai, confirmed: false })).charged, false);
  db.set({ ownerId: "creator" });
  await purchaseStudyProject("student", ai);
  assert.equal((await purchaseStudyProject("student", { ...ai, confirmed: false })).charged, false);
  assert.equal(db.state().ledger.length, 1);
});

test("paid AI purchase atomically writes entitlement, negative ledger and exact label", async () => {
  const db = fixture();
  const result = await purchaseStudyProject("student", ai);
  assert.equal(result.charged, true);
  assert.equal(result.offer.purchased, true);
  assert.equal(result.offer.requiresPurchase, false);
  assert.equal(db.state().balance, 50);
  assert.equal(db.state().purchases.length, 1);
  assert.equal(db.state().purchases[0].aiProjectId, "resource");
  assert.equal(db.state().purchases[0].officialMaterialId, null);
  assert.equal(db.state().ledger[0].amount, -50);
  assert.equal(db.state().ledger[0].balanceAfter, 50);
  assert.equal(db.state().ledger[0].type, "project_purchase");
  assert.equal(db.state().ledger[0].note, "学习搭子：购买《基础会计学》");
  assert.equal(db.state().ledger[0].dedupeKey, "study_project_purchase:student:ai:resource");
});

test("official material uses its own price and independent purchase key", async () => {
  const db = fixture({ price: 60 });
  await purchaseStudyProject("student", { ...official, expectedDiamondPrice: 60 });
  assert.equal(db.state().balance, 40);
  assert.equal(db.state().purchases[0].officialMaterialId, "resource");
  assert.equal(db.state().purchases[0].aiProjectId, null);
  assert.equal(db.state().ledger[0].amount, -60);
});

test("reopen with a changed price and zero balance remains free", async () => {
  const db = fixture({ balance: 50 });
  await purchaseStudyProject("student", ai);
  db.set({ price: 90 });
  const result = await purchaseStudyProject("student", ai);
  assert.equal(result.charged, false);
  assert.equal(db.state().balance, 0);
  assert.equal(db.state().ledger.length, 1);
});

test("free visits create no entitlement; later paid access requires purchase", async () => {
  const db = fixture({ price: 0, balance: null });
  await purchaseStudyProject("student", { ...ai, expectedDiamondPrice: 0 });
  assert.equal(db.state().balance, null);
  assert.equal(db.state().purchases.length, 0);
  assert.equal(db.state().ledger.length, 0);
  db.set({ price: 50 });
  await assert.rejects(purchaseStudyProject("student", { ...ai, expectedDiamondPrice: 0 }), StudyProjectPriceChangedError);
});

test("price increases, decreases and becoming free require a new click", async () => {
  const db = fixture({ price: 60 });
  for (const price of [60, 20, 0]) {
    db.set({ price });
    await assert.rejects(purchaseStudyProject("student", ai), (error: unknown) => {
      assert.ok(error instanceof StudyProjectPriceChangedError);
      assert.equal(error.offer.diamondPrice, price);
      return true;
    });
  }
  assert.equal(db.state().balance, 100);
  assert.equal(db.state().ledger.length, 0);
});

test("creator access is free without creating a purchase", async () => {
  const db = fixture({ ownerId: "student", visibility: "private", balance: null });
  const result = await purchaseStudyProject("student", ai);
  assert.equal(result.charged, false);
  assert.equal(db.state().balance, null);
  assert.equal(db.state().purchases.length, 0);
});

test("insufficient balance rolls back account creation and all records", async () => {
  const db = fixture({ balance: null });
  await assert.rejects(purchaseStudyProject("student", ai), InsufficientDiamondBalanceError);
  assert.equal(db.state().balance, null);
  assert.equal(db.state().ledger.length, 0);
  assert.equal(db.state().purchases.length, 0);
});

test("purchase record failure rolls back the debit and ledger", async () => {
  const db = fixture({}, { failPurchase: true });
  await assert.rejects(purchaseStudyProject("student", ai), /purchase write failed/);
  assert.equal(db.state().balance, 100);
  assert.equal(db.state().ledger.length, 0);
  assert.equal(db.state().purchases.length, 0);
});

test("serialization conflicts retry the entire transaction without duplicate charges", async () => {
  const db = fixture({}, { conflicts: 2 });
  await purchaseStudyProject("student", ai);
  assert.equal(db.attempts(), 3);
  assert.equal(db.state().balance, 50);
  assert.equal(db.state().ledger.length, 1);
});

test("conflict retries are bounded and do not leave partial writes", async () => {
  const db = fixture({}, { conflicts: 10 });
  await assert.rejects(purchaseStudyProject("student", ai));
  assert.equal(db.attempts(), 4);
  assert.equal(db.state().balance, 100);
  assert.equal(db.state().ledger.length, 0);
});

test("repeated requests after serialized commits debit only once", async () => {
  const db = fixture({ balance: 50 });
  const results = await Promise.all(Array.from({ length: 8 }, () => purchaseStudyProject("student", ai)));
  assert.equal(results.filter((result) => result.charged).length, 1);
  assert.equal(db.state().balance, 0);
  assert.equal(db.state().purchases.length, 1);
});

test("private, offline, not-ready and deleted resources never charge", async () => {
  const db = fixture();
  for (const values of [
    { visibility: "private", status: "ready", deletedAt: null },
    { visibility: "offline", status: "ready", deletedAt: null },
    { visibility: "public", status: "processing", deletedAt: null },
    { visibility: "public", status: "ready", deletedAt: new Date() }
  ]) {
    db.set(values);
    await assert.rejects(purchaseStudyProject("student", ai), StudyProjectAccessError);
    await assert.rejects(purchaseStudyProject("student", official), StudyProjectAccessError);
  }
  assert.equal(db.state().balance, 100);
});

test("purchased resources still honor publication and course scope", async () => {
  const db = fixture();
  await purchaseStudyProject("student", official);
  db.set({ majorId: "another-major" });
  await assert.rejects(purchaseStudyProject("student", official), StudyProjectAccessError);
  db.set({ majorId: null, visibility: "offline" });
  await assert.rejects(purchaseStudyProject("student", official), StudyProjectAccessError);
  db.set({ visibility: "public", price: 90 });
  assert.equal((await purchaseStudyProject("student", official)).charged, false);
  assert.equal(db.state().ledger.length, 1);
});

test("official scope allows matching major/public subject and denies mismatches", async () => {
  const db = fixture({ majorId: "major-a" });
  await assert.rejects(purchaseStudyProject("student", official), StudyProjectAccessError);
  db.set({ profile: { majorId: "major-a", publicSubjectId: null } });
  await purchaseStudyProject("student", official);
  assert.equal(db.state().ledger.length, 1);
  const scope = await publicOfficialMaterialWhere("student", {
    studentProfile: { findUnique: async () => ({ majorId: null, publicSubjectId: "subject-a" }) }
  } as never);
  assert.equal(matches({ visibility: "public", fileStatus: "ready", deletedAt: null, majorId: null, publicSubjectId: "subject-a" }, scope as Row), true);
});

test("AI content filter protects nodes/chat while preserving ownership and free access", () => {
  const where = accessibleAiStudyProjectWhere("student") as Row;
  const row = { ownerId: "creator", deletedAt: null, visibility: "public", status: "ready", diamondPrice: 50, purchases: [] };
  assert.equal(matches(row, where), false);
  assert.equal(matches({ ...row, diamondPrice: 0 }, where), true);
  assert.equal(matches({ ...row, ownerId: "student", visibility: "private" }, where), true);
  assert.equal(matches({ ...row, purchases: [{ userId: "student" }] }, where), true);
  assert.equal(matches({ ...row, purchases: [{ userId: "other" }] }, where), false);
  assert.equal(matches({ ...row, visibility: "private", purchases: [{ userId: "student" }] }, where), false);
  assert.equal(matches({ ...row, deletedAt: new Date(), ownerId: "student" }, where), false);
});

test("purchase gate fetches metadata only, not source text or content", async () => {
  let selected: Row = {};
  await getStudyProjectOffer("student", "ai", "resource", {
    aiStudyProject: { findFirst: async ({ select }: { select: Row }) => {
      selected = select;
      return { id: "resource", title: "Title", diamondPrice: 50, ownerId: "creator", purchases: [] };
    } }
  } as never);
  assert.deepEqual(Object.keys(selected).sort(), ["diamondPrice", "id", "ownerId", "purchases", "title"]);
});

test("purchase input rejects negative, fractional, overflow prices and unexpected user IDs", () => {
  for (const expectedDiamondPrice of [-1, 0.5, 2147483648, "50"]) {
    assert.equal(studyProjectPurchaseSchema.safeParse({ ...ai, expectedDiamondPrice }).success, false);
  }
  assert.equal(studyProjectPurchaseSchema.safeParse({ ...ai, userId: "victim" }).success, false);
  assert.equal(studyProjectPurchaseSchema.safeParse({ ...ai, kind: "unknown" }).success, false);
  assert.equal(studyProjectPurchaseSchema.safeParse({ ...ai, confirmed: "true" }).success, false);
  assert.equal(studyProjectPurchaseSchema.safeParse(ai).success, true);
});

function purchaserListFixture(options: { missing?: boolean; empty?: boolean } = {}) {
  const rows = options.empty ? [] : [
    ...Array.from({ length: 23 }, (_, index) => ({
      id: `purchase-${String(index).padStart(2, "0")}`,
      kind: "ai", aiProjectId: "resource", officialMaterialId: null,
      createdAt: new Date(Date.UTC(2026, 7, 27, 16, index)),
      user: { id: `student-${index}`, username: `user${index}`, role: "student" }
    })),
    { id: "official", kind: "official", aiProjectId: null, officialMaterialId: "resource", createdAt: new Date("2026-08-27T16:05:00Z"), user: { id: "official-student", username: "official-user", role: "student" } },
    { id: "other", kind: "ai", aiProjectId: "other-resource", officialMaterialId: null, createdAt: new Date(), user: { id: "other-student", username: "other-user", role: "student" } },
    { id: "admin", kind: "ai", aiProjectId: "resource", officialMaterialId: null, createdAt: new Date(), user: { id: "admin", username: "admin", role: "admin" } }
  ];
  let queries = 0;
  const filter = (where: Row) => {
    assert.deepEqual(where.user, { role: "student" });
    assert.equal(Object.keys(where).length, 3);
    return rows.filter((row) => row.kind === where.kind && row.user.role === "student" &&
      (where.kind === "ai" ? row.aiProjectId === where.aiProjectId : row.officialMaterialId === where.officialMaterialId));
  };
  const transaction = async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>, config: unknown) => {
    assert.deepEqual(config, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    const findUnique = async ({ where, select }: { where: Row; select: Row }) => {
      assert.deepEqual(where, { id: "resource" });
      assert.deepEqual(select, { title: true });
      return options.missing ? null : { title: "测试项目" };
    };
    const tx = {
      aiStudyProject: { findUnique }, officialStudyMaterial: { findUnique },
      studyProjectPurchase: {
        count: async ({ where }: { where: Row }) => { queries += 1; return filter(where).length; },
        findMany: async ({ where, orderBy, skip, take, select }: { where: Row; orderBy: unknown; skip: number; take: number; select: Row }) => {
          queries += 1;
          assert.deepEqual(orderBy, [{ createdAt: "desc" }, { id: "desc" }]);
          assert.equal(take, 20);
          assert.deepEqual(select, { createdAt: true, user: { select: { id: true, username: true } } });
          return filter(where).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id)).slice(skip, skip + take);
        }
      }
    } as unknown as Prisma.TransactionClient;
    return callback(tx);
  };
  mock.method(prisma, "$transaction", transaction as typeof prisma.$transaction);
  return { queries: () => queries };
}

test("admin AI purchaser pages count students once and exclude other projects/types/admins", async () => {
  purchaserListFixture();
  const first = await listAdminProjectPurchasers({ kind: "ai", id: "resource", page: 1 });
  assert.ok(first);
  assert.equal(first.totalCount, 23);
  assert.equal(first.users.length, 20);
  assert.equal(first.totalPages, 2);
  assert.deepEqual(first.users[0], { userId: "student-22", username: "user22", purchasedAt: "2026-08-27T16:22:00.000Z" });
  const last = await listAdminProjectPurchasers({ kind: "ai", id: "resource", page: 999 });
  assert.ok(last);
  assert.equal(last.page, 2);
  assert.equal(last.users.length, 3);
  assert.equal(new Set([...first.users, ...last.users].map((user) => user.userId)).size, 23);
});

test("admin official purchaser list stays independent for an identical resource ID", async () => {
  purchaserListFixture();
  const page = await listAdminProjectPurchasers({ kind: "official", id: "resource", page: 1 });
  assert.ok(page);
  assert.equal(page.totalCount, 1);
  assert.deepEqual(page.users, [{ userId: "official-student", username: "official-user", purchasedAt: "2026-08-27T16:05:00.000Z" }]);
});

test("projects without purchases return zero and an empty page", async () => {
  purchaserListFixture({ empty: true });
  const page = await listAdminProjectPurchasers({ kind: "ai", id: "resource", page: 8 });
  assert.ok(page);
  assert.equal(page.totalCount, 0);
  assert.equal(page.page, 1);
  assert.deepEqual(page.users, []);
});

test("physically deleted project does not expose retained purchase snapshots", async () => {
  const db = purchaserListFixture({ missing: true });
  assert.equal(await listAdminProjectPurchasers({ kind: "ai", id: "resource", page: 1 }), null);
  assert.equal(db.queries(), 0);
});

test("admin purchaser input validates project kind, ID and pagination before querying", async () => {
  const db = purchaserListFixture();
  for (const page of [0, -1, 1.5, "2", 2147483648]) {
    assert.equal(adminProjectPurchasersSchema.safeParse({ kind: "ai", id: "resource", page }).success, false);
  }
  for (const input of [{ kind: "unknown", id: "resource" }, { kind: "ai", id: " " }, { kind: "ai", id: "resource", userId: "victim" }]) {
    assert.equal(adminProjectPurchasersSchema.safeParse(input).success, false);
  }
  assert.equal(adminProjectPurchasersSchema.parse({ kind: "official", id: "resource" }).page, 1);
  await assert.rejects(listAdminProjectPurchasers({ kind: "ai", id: "resource", page: 0 }));
  assert.equal(db.queries(), 0);
});
