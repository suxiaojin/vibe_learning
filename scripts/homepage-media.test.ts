import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import * as ts from "typescript";
import sharp from "sharp";
import { NextRequest, NextResponse } from "next/server";
import { HomepageMediaError, isHomepageMp4, parseHomepageMediaRange, prepareHomepageMedia } from "../src/lib/homepage-media";

const nativeRequire = createRequire(import.meta.url);
const slots = ["hero", "learning-path", "ai-explanation", "study-buddy", "review", "start"];
const fixturePath = process.env.HOMEPAGE_TEST_MP4;
const fixture = fixturePath ? readFileSync(fixturePath) : null;

function loadSource(path: string, mocks: Record<string, unknown>) {
  const source = readFileSync(resolve(path), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const exports: Record<string, any> = {};
  runInNewContext(output, {
    exports, require: (id: string) => id in mocks ? mocks[id] : nativeRequire(id),
    Buffer, File, FormData, Headers, URL, console, process
  }, { filename: path });
  return exports;
}

test("real H.264 MP4 keeps its exact bytes; MIME-less .mp4 is accepted", { skip: !fixture }, async () => {
  assert.equal(isHomepageMp4(fixture!), true);
  for (const type of ["video/mp4", ""]) {
    const media = await prepareHomepageMedia(new File([new Uint8Array(fixture!)], "intro.mp4", { type }));
    assert.equal(media.contentType, "video/mp4");
    assert.deepEqual(media.body, fixture);
  }
});

test("renamed, truncated, audio-only and empty files are rejected", async () => {
  const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#00857b" } }).png().toBuffer();
  await assert.rejects(prepareHomepageMedia(new File([new Uint8Array(png)], "fake.mp4", { type: "video/mp4" })), { code: "homepage-video-invalid" });
  await assert.rejects(prepareHomepageMedia(new File([], "empty.mp4")), { code: "homepage-media-required" });
  await assert.rejects(prepareHomepageMedia(new File(["not an image"], "fake.png", { type: "image/png" })), { code: "homepage-media-invalid" });
  assert.equal(isHomepageMp4(Buffer.from("0000ftypisom")), false);
  if (fixture) {
    assert.equal(isHomepageMp4(fixture.subarray(0, fixture.length - 1)), false);
    const audio = Buffer.from(fixture);
    const handler = audio.indexOf(Buffer.from("vide"));
    assert.ok(handler >= 0);
    audio.write("soun", handler, "ascii");
    assert.equal(isHomepageMp4(audio), false);
  }
});

test("oversize rejection happens before the upload is decoded", async () => {
  for (const [name, type, size, code] of [
    ["large.mp4", "video/mp4", 50 * 1024 * 1024 + 1, "homepage-video-too-large"],
    ["large.png", "image/png", 5 * 1024 * 1024 + 1, "homepage-image-too-large"]
  ] as const) {
    await assert.rejects(prepareHomepageMedia({ name, type, size, arrayBuffer: () => { throw new Error("must not read oversize body"); } } as unknown as File), { code });
  }
});

test("PNG, JPEG and WebP remain WebP images, with the existing bounds", async () => {
  const source = sharp({ create: { width: 2000, height: 1000, channels: 4, background: "#00857b" } });
  for (const [extension, type] of [["png", "image/png"], ["jpeg", "image/jpeg"], ["webp", "image/webp"]] as const) {
    const input = await source.clone().toFormat(extension).toBuffer();
    const media = await prepareHomepageMedia(new File([new Uint8Array(input)], `test.${extension}`, { type }));
    const metadata = await sharp(media.body).metadata();
    assert.equal(media.contentType, "image/webp");
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, 1600);
    assert.equal(metadata.height, 800);
    assert.ok(media.body.length <= 1024 * 1024);
  }
});

test("byte ranges support seek, suffix, open end and safe bounds", () => {
  for (const [range, expected] of [
    ["bytes=0-0", { start: 0, end: 0 }], ["bytes=7-", { start: 7, end: 9 }],
    ["bytes=-3", { start: 7, end: 9 }], ["bytes=-30", { start: 0, end: 9 }],
    ["bytes=5-100", { start: 5, end: 9 }]
  ] as const) assert.deepEqual(parseHomepageMediaRange(range, 10), expected);
  for (const range of ["bytes=10-", "bytes=5-4", "bytes=-0", "bytes=-", "bytes=0-1,3-4", "items=0-1", "bytes=9007199254740993-", "bytes=1.2-4"]) {
    assert.equal(parseHomepageMediaRange(range, 10), null, range);
  }
  assert.equal(parseHomepageMediaRange("bytes=0-", 0), null);
});

test("public route returns exact partial bytes, validators, HEAD and default redirects", async () => {
  let row: { body: Buffer; contentType: string; updatedAt: Date } | null = {
    body: fixture ?? Buffer.from("0123456789"), contentType: "video/mp4", updatedAt: new Date("2026-10-16T00:00:00Z")
  };
  const reads: unknown[][] = [];
  const route = loadSource("src/app/api/homepage/images/[slot]/route.ts", {
    "next/server": { NextResponse },
    "@/lib/homepage-settings": { homepageImageSlots: slots },
    "@/lib/homepage-media": { parseHomepageMediaRange },
    "@/lib/prisma": { prisma: { $transaction: async (callback: any, options: any) => {
      assert.equal(options.isolationLevel, "RepeatableRead");
      return callback({ $queryRaw: async (sql: TemplateStringsArray, ...values: unknown[]) => {
        reads.push(values);
        if (sql.join("").includes("octet_length")) return row ? [{ contentType: row.contentType, updatedAt: row.updatedAt, size: row.body.length }] : [];
        assert.match(sql.join(""), /::integer/);
        return [{ body: row!.body.subarray(Number(values[0]) - 1, Number(values[0]) - 1 + Number(values[1])) }];
      } });
    } } }
  });
  const context = { params: Promise.resolve({ slot: "hero" }) };
  const request = (headers: Record<string, string> = {}, query = `?v=${row!.updatedAt.getTime()}`) => new NextRequest(`http://localhost/api/homepage/images/hero${query}`, { headers });
  const full = await route.GET(request(), context);
  assert.equal(full.status, 200);
  assert.deepEqual(Buffer.from(await full.arrayBuffer()), row.body);
  assert.equal(full.headers.get("content-type"), "video/mp4");
  assert.match(full.headers.get("cache-control"), /immutable/);
  const etag = full.headers.get("etag");
  for (const [range, start, end] of [["bytes=0-3", 0, 3], ["bytes=-4", row.body.length - 4, row.body.length - 1], [`bytes=${row.body.length - 4}-`, row.body.length - 4, row.body.length - 1]] as const) {
    const response = await route.GET(request({ range }), context);
    assert.equal(response.status, 206);
    assert.equal(response.headers.get("content-range"), `bytes ${start}-${end}/${row.body.length}`);
    assert.equal(response.headers.get("content-length"), "4");
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), row.body.subarray(start, end + 1));
    assert.deepEqual(reads.at(-1), [start + 1, 4, "hero"]);
  }
  const bad = await route.GET(request({ range: `bytes=${row.body.length}-` }), context);
  assert.equal(bad.status, 416);
  assert.equal(bad.headers.get("content-range"), `bytes */${row.body.length}`);
  assert.equal(bad.headers.get("cache-control"), "no-store");
  const beforeHead = reads.length;
  const head = await route.HEAD(request({ range: "bytes=0-3" }), context);
  assert.equal(head.status, 200);
  assert.equal(head.headers.get("content-length"), String(row.body.length));
  assert.equal((await head.arrayBuffer()).byteLength, 0);
  assert.equal(reads.length, beforeHead + 1);
  const before304 = reads.length;
  assert.equal((await route.GET(request({ "if-none-match": etag }), context)).status, 304);
  assert.equal(reads.length, before304 + 1);
  assert.equal((await route.GET(request({ range: "bytes=0-3", "if-range": '"old"' }), context)).status, 200);
  assert.equal((await route.GET(request({ range: "bytes=0-3", "if-range": etag }), context)).status, 206);
  assert.match((await route.GET(request({}, "?v=old"), context)).headers.get("cache-control"), /must-revalidate/);
  const before404 = reads.length;
  assert.equal((await route.GET(request(), { params: Promise.resolve({ slot: "bad" }) })).status, 404);
  assert.equal(reads.length, before404);
  row.contentType = "image/webp";
  assert.equal((await route.GET(request({ range: "bytes=0-3" }), context)).status, 200);
  row = null;
  const fallback = await route.GET(new NextRequest("http://localhost/api/homepage/images/hero"), context);
  assert.equal(fallback.status, 307);
  assert.equal(fallback.headers.get("location"), "http://localhost/images/homepage/hero.webp");
  assert.equal(fallback.headers.get("cache-control"), "no-store");
});

test("admin upload and restore affect only the chosen slot and require admin first", { skip: !fixture }, async () => {
  let allowed = true;
  let mutations = 0;
  const stored = new Map<string, { body: Buffer; contentType: string }>();
  const actions = loadSource("src/app/admin/settings/homepage-actions.ts", {
    "next/cache": { revalidatePath() {} },
    "next/navigation": { redirect(url: string) { throw new Error(`REDIRECT:${url}`); } },
    "@/lib/auth": { async requireAdmin() { if (!allowed) throw new Error("UNAUTHORIZED"); } },
    "@/lib/homepage-settings": { homepageImageSlots: slots },
    "@/lib/homepage-media": { HomepageMediaError, prepareHomepageMedia },
    "@/lib/prisma": { prisma: { homepageImage: {
      async upsert(input: any) { mutations++; stored.set(input.where.slot, input.update); },
      async deleteMany(input: any) { mutations++; stored.delete(input.where.slot); }
    } } }
  });
  const data = (slot: string, body: Buffer = fixture!, name = "intro.mp4", type = "video/mp4") => {
    const form = new FormData();
    form.set("slot", slot);
    form.set("image", new File([new Uint8Array(body)], name, { type }));
    return form;
  };
  for (const slot of slots) {
    await assert.rejects(actions.uploadHomepageImage(data(slot)), new RegExp(`notice=homepage-media-saved&openImage=${slot}`));
    assert.equal(stored.get(slot)?.contentType, "video/mp4");
    assert.deepEqual(stored.get(slot)?.body, fixture);
  }
  const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#00857b" } }).png().toBuffer();
  await assert.rejects(actions.uploadHomepageImage(data("hero", png, "image.png", "image/png")), /notice=homepage-media-saved/);
  assert.equal(stored.get("hero")?.contentType, "image/webp");
  assert.equal(stored.get("review")?.contentType, "video/mp4");
  const beforeInvalid = mutations;
  await assert.rejects(actions.uploadHomepageImage(data("hero", Buffer.from("fake"))), /error=homepage-video-invalid&openImage=hero/);
  await assert.rejects(actions.uploadHomepageImage(data("invalid")), /error=homepage-image-invalid/);
  assert.equal(mutations, beforeInvalid);
  allowed = false;
  await assert.rejects(actions.uploadHomepageImage(data("review")), /UNAUTHORIZED/);
  await assert.rejects(actions.restoreHomepageImage(data("review")), /UNAUTHORIZED/);
  assert.equal(mutations, beforeInvalid);
  allowed = true;
  await assert.rejects(actions.restoreHomepageImage(data("review")), /notice=homepage-image-restored&openImage=review/);
  assert.equal(stored.has("review"), false);
  assert.equal(stored.size, 5);
});

test("homepage and admin render mixed images and videos in all six slots", async () => {
  const React = nativeRequire("react");
  const { renderToStaticMarkup } = nativeRequire("react-dom/server");
  const settings = loadSource("src/lib/homepage-settings.ts", { "@/lib/prisma": { prisma: {} } });
  const media = Object.fromEntries(slots.map((slot) => [slot, { url: `/api/homepage/images/${slot}?v=1`, type: "video" }]));
  const components = {
    "@/lib/homepage-settings": settings,
    "next/image": { __esModule: true, default: ({ priority, ...props }: any) => React.createElement("img", props) },
    "next/link": { __esModule: true, default: ({ prefetch, ...props }: any) => React.createElement("a", props) },
    "./marketing-homepage.module.css": { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) }
  };
  const marketing = loadSource("src/components/marketing-homepage.tsx", components);
  const admin = loadSource("src/components/admin-homepage-settings.tsx", {
    "@/lib/homepage-settings": settings,
    "@/app/admin/settings/homepage-actions": { saveHomepageText() {}, uploadHomepageImage() {}, restoreHomepageImage() {} }
  });
  const html = renderToStaticMarkup(React.createElement(marketing.MarketingHomepage, { signedIn: false, content: settings.homepageTextDefaults, media }));
  assert.equal((html.match(/<video\b/g) ?? []).length, 6);
  assert.equal((html.match(/preload="none"/g) ?? []).length, 6);
  assert.equal((html.match(/controls=""/g) ?? []).length, 6);
  assert.equal(html.includes("autoPlay"), false);
  assert.ok(html.includes('href="/register"'));
  assert.ok(html.includes('href="/login"'));
  const adminHtml = renderToStaticMarkup(React.createElement(admin.AdminHomepageSettings, { content: settings.homepageTextDefaults, media }));
  assert.equal((adminHtml.match(/<video\b/g) ?? []).length, 6);
  assert.equal((adminHtml.match(/<details\b/g) ?? []).length, 13);
  assert.equal((adminHtml.match(/<details[^>]* open=""/g) ?? []).length, 0);
  assert.equal((adminHtml.match(/accept="image\/png,image\/jpeg,image\/webp,video\/mp4,.mp4"/g) ?? []).length, 6);
  media.hero = { url: "/images/homepage/hero.webp", type: "image" };
  const mixed = renderToStaticMarkup(React.createElement(marketing.MarketingHomepage, { signedIn: true, content: settings.homepageTextDefaults, media }));
  assert.equal((mixed.match(/<video\b/g) ?? []).length, 5);
  assert.ok(mixed.includes('src="/images/homepage/hero.webp"'));
  assert.ok(mixed.includes('href="/learn"'));
});

test("PostgreSQL range SQL and existing table metadata work in a read-only snapshot", { skip: process.env.HOMEPAGE_TEST_DATABASE !== "1" }, async () => {
  const { PrismaClient } = nativeRequire("@prisma/client");
  const client = new PrismaClient();
  try {
    await client.$transaction(async (tx: any) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const [result] = await tx.$queryRaw`SELECT substring(${Buffer.from("0123456789")}::bytea FROM ${3}::integer FOR ${4}::integer) AS "body"`;
      assert.equal(Buffer.from(result.body).toString(), "2345");
      const metadata = await tx.$queryRaw`SELECT "slot", "contentType", "updatedAt", octet_length("body") AS "size" FROM "homepage_images" LIMIT 6`;
      for (const row of metadata) {
        assert.ok(slots.includes(row.slot));
        assert.equal(typeof row.size, "number");
        assert.ok(row.updatedAt instanceof Date);
      }
    }, { isolationLevel: "RepeatableRead" });
  } finally {
    await client.$disconnect();
  }
});
