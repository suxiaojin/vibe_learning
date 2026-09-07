import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import {
  AvatarStorageError,
  buildAvatarPublicUrl,
  detectAvatarContentType,
  getAvatarStorageKeyFromUrl,
  normalizeAvatarImage
} from "../src/lib/avatar-storage";

test("detects supported image signatures", () => {
  assert.equal(detectAvatarContentType(Buffer.from([0xff, 0xd8, 0xff, 0x00])), "image/jpeg");
  assert.equal(detectAvatarContentType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
  assert.equal(detectAvatarContentType(Buffer.from("RIFF0000WEBP", "ascii")), "image/webp");
  assert.equal(detectAvatarContentType(Buffer.from("not an image")), null);
});

test("normalizes a valid image to a 256 square WebP", async () => {
  const png = await sharp({
    create: { width: 480, height: 320, channels: 3, background: { r: 22, g: 163, b: 41 } }
  }).png().toBuffer();
  const output = await normalizeAvatarImage(png, "image/png");
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, 256);
  assert.equal(metadata.height, 256);
});

test("accepts a supported image when the client MIME type does not match", async () => {
  const png = await sharp({
    create: { width: 32, height: 32, channels: 3, background: { r: 0, g: 0, b: 0 } }
  }).png().toBuffer();
  const output = await normalizeAvatarImage(png, "image/jpeg");
  assert.equal((await sharp(output).metadata()).format, "webp");
});

test("rejects unsupported file content even when the client declares an image MIME type", async () => {
  await assert.rejects(() => normalizeAvatarImage(Buffer.from("not an image"), "image/png"), (error: unknown) => {
    return error instanceof AvatarStorageError && error.code === "invalid_type";
  });
});

test("builds and parses an immutable avatar URL", () => {
  const fileName = "11111111-1111-4111-8111-111111111111.webp";
  const url = buildAvatarPublicUrl("cmtest_user-1", fileName);
  assert.equal(url, `/api/avatars/cmtest_user-1/${fileName}`);
  assert.equal(getAvatarStorageKeyFromUrl(url), `avatars/cmtest_user-1/${fileName}`);
  assert.equal(getAvatarStorageKeyFromUrl("/api/avatars/../secret.webp"), null);
});
