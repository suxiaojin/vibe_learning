import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import ts from "typescript";
import { runInNewContext } from "node:vm";
import { isAgreementKey, parseChangelog } from "../src/lib/changelog-validation";

function loadActions(path: string, mocks: Record<string, unknown>) {
  const module = { exports: {} as Record<string, (...args: any[]) => Promise<any>> };
  const source = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(source, { module, exports: module.exports, require: (name: string) => {
    if (!(name in mocks)) throw new Error(`Unexpected dependency: ${name}`);
    return mocks[name];
  } });
  return module.exports;
}

test("admin mutations check authorization first and agreement saves patch only the selected field", async () => {
  let authorized = false;
  const denied = new Error("denied");
  const writes: any[] = [];
  const actions = loadActions("src/app/admin/settings/agreement-actions.ts", {
    "next/cache": { revalidatePath() {} },
    "@/lib/auth": { requireAdmin: async () => { if (!authorized) throw denied; } },
    "@/lib/prisma": { prisma: {
      systemSetting: { upsert: async (args: unknown) => writes.push(args) },
      changelogEntry: { create: async (args: unknown) => writes.push(args), updateMany: async (args: unknown) => { writes.push(args); return { count: 1 }; } }
    } },
    "@/lib/system-settings": { systemSettingsDefaults: { id: "default" }, systemSettingsId: "default" },
    "@/lib/changelog-validation": { isAgreementKey, parseChangelog }
  });
  await assert.rejects(actions.saveAgreement(form()), (error) => error === denied);
  await assert.rejects(actions.saveChangelog(form()), (error) => error === denied);
  await assert.rejects(actions.withdrawChangelog("entry"), (error) => error === denied);
  assert.equal(writes.length, 0);
  authorized = true;
  assert.ok((await actions.saveAgreement(form({ key: "changelogContent" }))).error);
  assert.equal(writes.length, 0);
  await actions.saveAgreement(form({ key: "faqContent", content: "新的常见问题" }));
  assert.equal(JSON.stringify(writes[0].update), JSON.stringify({ faqContent: "新的常见问题" }));
  await actions.saveChangelog(form({ isPublished: "false" }));
  assert.equal(writes[1].data.isPublished, false);
  await actions.withdrawChangelog("entry");
  assert.equal(writes[2].data.isPublished, false);
});

test("student actions require login and detail reads exclude drafts and withdrawn records", async () => {
  let authorized = false;
  let reads = 0;
  const denied = new Error("denied");
  const actions = loadActions("src/app/help/actions.ts", {
    "@/lib/auth": { requireUser: async () => { if (!authorized) throw denied; } },
    "@/lib/prisma": { prisma: { changelogEntry: { findFirst: async (args: any) => {
      reads += 1;
      assert.equal(args.where.isPublished, true);
      return args.where.id === "published" ? { title: "Title", content: "body", releaseDate: null } : null;
    } } } },
    "@/lib/changelog-queries": { listPublishedChangelogs: async () => { reads += 1; return { entries: [], hasMore: false }; } }
  });
  await assert.rejects(actions.readChangelog("published"), (error) => error === denied);
  await assert.rejects(actions.loadChangelogs(0), (error) => error === denied);
  assert.equal(reads, 0);
  authorized = true;
  for (const offset of [-1, 0.5, NaN, Infinity]) await assert.rejects(actions.loadChangelogs(offset));
  assert.equal(reads, 0);
  assert.equal(await actions.readChangelog("draft"), null);
  assert.equal(await actions.readChangelog("withdrawn"), null);
  assert.equal((await actions.readChangelog("published")).content, "body");
});

function form(overrides: Record<string, string> = {}) {
  const result = new FormData();
  for (const [key, value] of Object.entries({ title: "更新日志", badgeText: "最新", summary: "摘要", content: "## 新功能\n\n正文", releaseDate: "2026-09-20", isPublished: "false", ...overrides })) result.set(key, value);
  return result;
}

test("only the four independent content fields can be written", () => {
  for (const key of ["userAgreementContent", "privacyPolicyContent", "platformAgreementContent", "faqContent"]) assert.equal(isAgreementKey(key), true);
  for (const key of ["id", "changelogContent", "customerServiceEmail", "__proto__", "loginMarketingTitle"]) assert.equal(isAgreementKey(key), false);
});

test("draft and publication are explicit and dates do not shift across time zones", () => {
  const draft = parseChangelog(form());
  assert.ok(draft.data);
  assert.equal(draft.data.isPublished, false);
  assert.equal(draft.data.badgeText, "最新");
  assert.equal(draft.data.releaseDate.toISOString(), "2026-09-20T00:00:00.000Z");
  assert.equal(parseChangelog(form({ isPublished: "true" })).data?.isPublished, true);
  assert.ok(parseChangelog(form({ isPublished: "published" })).error);
});

test("invalid calendar dates and empty or oversized input are rejected on the server", () => {
  for (const date of ["", "2026-02-29", "2026-02-30", "2026-13-01", "2026-9-20", "not-a-date"]) assert.ok(parseChangelog(form({ releaseDate: date })).error, date);
  assert.ok(parseChangelog(form({ releaseDate: "2028-02-29" })).data);
  const invalidInputs: Record<string, string>[] = [{ title: " " }, { content: "\n" }, { title: "a".repeat(121) }, { badgeText: "a".repeat(21) }, { summary: "a".repeat(301) }, { content: "a".repeat(200001) }];
  for (const changes of invalidInputs) assert.ok(parseChangelog(form(changes)).error);
  assert.ok(parseChangelog(form({ summary: "" })).data);
  assert.equal(parseChangelog(form({ badgeText: "  " })).data?.badgeText, "");
});

test("migration preserves the original Markdown exactly and does not invent dates; empty settings produce no entry", async () => {
  const client = new PrismaClient();
  const sql = readFileSync("prisma/migrations/20260920100000_add_changelog_entries/migration.sql", "utf8").replace('CREATE TABLE "changelog_entries"', 'CREATE TEMP TABLE "changelog_entries"');
  const rollback = new Error("rollback isolated migration test");
  try {
    for (const content of [null, "", "  ", "\n\r\t  ", "  # 历史日志\n\n- 中文内容\n- [链接](https://example.com)\n"]) {
      await assert.rejects(client.$transaction(async (tx) => {
        // All writes target temporary tables shadowing the unqualified migration names.
        await tx.$executeRawUnsafe('CREATE TEMP TABLE "system_settings" ("id" TEXT, "changelogContent" TEXT)');
        if (content !== null) await tx.$executeRaw`INSERT INTO "system_settings" VALUES ('default', ${content})`;
        for (const statement of sql.split(";").map((part) => part.trim()).filter(Boolean)) await tx.$executeRawUnsafe(statement);
        const entries = await tx.$queryRawUnsafe<Array<{ content: string; releaseDate: Date | null; isPublished: boolean }>>('SELECT "content", "releaseDate", "isPublished" FROM "changelog_entries"');
        assert.equal(entries.length, content?.trim() ? 1 : 0);
        if (entries.length) {
          assert.equal(entries[0].content, content);
          assert.equal(entries[0].releaseDate, null);
          assert.equal(entries[0].isPublished, true);
        }
        throw rollback;
      }), (error) => error === rollback);
    }
  } finally { await client.$disconnect(); }
});

test("badge migration initializes only the current newest published entry and remains editable data", async () => {
  const client = new PrismaClient();
  const sql = readFileSync("prisma/migrations/20260920170000_add_changelog_badge_text/migration.sql", "utf8")
    .split("\n").filter((line) => !line.trim().startsWith("--")).join("\n");
  const rollback = new Error("rollback isolated badge migration test");
  try {
    await assert.rejects(client.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`CREATE TEMP TABLE "changelog_entries" (
        "id" TEXT PRIMARY KEY,
        "isPublished" BOOLEAN NOT NULL,
        "releaseDate" DATE,
        "createdAt" TIMESTAMP(3) NOT NULL
      )`);
      await tx.$executeRawUnsafe(`INSERT INTO "changelog_entries" ("id", "isPublished", "releaseDate", "createdAt") VALUES
        ('older', true, DATE '2026-09-01', TIMESTAMP '2026-09-01'),
        ('newest', true, DATE '2026-09-20', TIMESTAMP '2026-09-20'),
        ('draft-later', false, DATE '2026-09-21', TIMESTAMP '2026-09-21')`);
      for (const statement of sql.split(";").map((part) => part.trim()).filter(Boolean)) await tx.$executeRawUnsafe(statement);
      const entries = await tx.$queryRawUnsafe<Array<{ id: string; badgeText: string }>>('SELECT "id", "badgeText" FROM "changelog_entries" ORDER BY "id"');
      assert.deepEqual(entries.map((entry) => [entry.id, entry.badgeText]), [["draft-later", ""], ["newest", "最新"], ["older", ""]]);
      await tx.$executeRawUnsafe(`UPDATE "changelog_entries" SET "badgeText" = '' WHERE "id" = 'newest'`);
      assert.equal((await tx.$queryRawUnsafe<Array<{ badgeText: string }>>(`SELECT "badgeText" FROM "changelog_entries" WHERE "id" = 'newest'`))[0].badgeText, "");
      throw rollback;
    }), (error) => error === rollback);
  } finally { await client.$disconnect(); }
});
