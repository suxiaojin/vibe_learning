import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { deleteAiStudyObject, uploadAiStudyObject } from "@/lib/ai-study-storage";

export const avatarMaxBytes = 800 * 1024;
export const avatarOutputSize = 256;

const avatarUserIdPattern = /^[A-Za-z0-9_-]{1,128}$/;
const avatarFileNamePattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/i;

export type AvatarStorageErrorCode = "invalid_image" | "invalid_type" | "too_large";

export class AvatarStorageError extends Error {
  code: AvatarStorageErrorCode;

  constructor(code: AvatarStorageErrorCode, message: string) {
    super(message);
    this.name = "AvatarStorageError";
    this.code = code;
  }
}

export async function storeUploadedAvatar(userId: string, file: File) {
  if (file.size > avatarMaxBytes) {
    throw new AvatarStorageError("too_large", "Avatar exceeds the upload size limit.");
  }

  const body = Buffer.from(await file.arrayBuffer());
  return storeAvatarBuffer(userId, body, file.type);
}

export async function storeAvatarBuffer(userId: string, body: Buffer, declaredContentType: string) {
  if (!avatarUserIdPattern.test(userId)) {
    throw new Error("Invalid avatar owner id.");
  }
  if (body.byteLength > avatarMaxBytes) {
    throw new AvatarStorageError("too_large", "Avatar exceeds the upload size limit.");
  }

  const normalizedBody = await normalizeAvatarImage(body, declaredContentType);
  const fileName = `${randomUUID()}.webp`;
  const key = getAvatarStorageKey(userId, fileName);
  await uploadAiStudyObject({ key, body: normalizedBody, contentType: "image/webp" });

  return {
    body: normalizedBody,
    key,
    url: buildAvatarPublicUrl(userId, fileName)
  };
}

export async function normalizeAvatarImage(body: Buffer, _declaredContentType: string) {
  const detectedContentType = detectAvatarContentType(body);
  if (!detectedContentType) {
    throw new AvatarStorageError("invalid_type", "Avatar content is not a supported image type.");
  }

  try {
    return await sharp(body, { failOn: "error", limitInputPixels: 16_777_216 })
      .rotate()
      .resize(avatarOutputSize, avatarOutputSize, { fit: "cover", position: "centre" })
      .webp({ effort: 4, quality: 82 })
      .toBuffer();
  } catch {
    throw new AvatarStorageError("invalid_image", "Avatar image cannot be decoded.");
  }
}

export function detectAvatarContentType(body: Buffer) {
  if (body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    body.length >= 8 &&
    body[0] === 0x89 &&
    body[1] === 0x50 &&
    body[2] === 0x4e &&
    body[3] === 0x47 &&
    body[4] === 0x0d &&
    body[5] === 0x0a &&
    body[6] === 0x1a &&
    body[7] === 0x0a
  ) {
    return "image/png";
  }
  if (body.length >= 12 && body.subarray(0, 4).toString("ascii") === "RIFF" && body.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }
  return null;
}

export function buildAvatarPublicUrl(userId: string, fileName: string) {
  if (!avatarUserIdPattern.test(userId) || !avatarFileNamePattern.test(fileName)) {
    throw new Error("Invalid avatar object path.");
  }
  return `/api/avatars/${encodeURIComponent(userId)}/${fileName}`;
}

export function getAvatarStorageKey(userId: string, fileName: string) {
  if (!avatarUserIdPattern.test(userId) || !avatarFileNamePattern.test(fileName)) {
    throw new Error("Invalid avatar object path.");
  }
  return `avatars/${userId}/${fileName}`;
}

export function getAvatarStorageKeyFromUrl(url: string) {
  const match = /^\/api\/avatars\/([^/]+)\/([^/]+\.webp)$/.exec(url);
  if (!match) {
    return null;
  }
  try {
    return getAvatarStorageKey(decodeURIComponent(match[1]), match[2]);
  } catch {
    return null;
  }
}

export async function deleteStoredAvatarByUrl(url: string) {
  const key = getAvatarStorageKeyFromUrl(url);
  if (key) {
    await deleteAiStudyObject(key);
  }
}
