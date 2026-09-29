import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { uploadAiStudyObject } from "@/lib/ai-study-storage";
import type { StudentNavIconKey } from "@/lib/student-nav-icons";

export const studentNavIconMaxBytes = 512 * 1024;

export type StudentNavIconUploadErrorCode = "too_large" | "invalid_type" | "invalid_image";

export class StudentNavIconUploadError extends Error {
  code: StudentNavIconUploadErrorCode;

  constructor(code: StudentNavIconUploadErrorCode, message: string) {
    super(message);
    this.name = "StudentNavIconUploadError";
    this.code = code;
  }
}

export async function storeStudentNavIcon(iconKey: StudentNavIconKey, file: File) {
  return storeCustomSquareIcon(`student-nav-icons/${iconKey}`, file);
}

export async function storeCourseCenterMajorIcon(file: File) {
  return storeCustomSquareIcon("course-center-major-icons", file);
}

async function storeCustomSquareIcon(objectPrefix: string, file: File) {
  if (file.size > studentNavIconMaxBytes) {
    throw new StudentNavIconUploadError("too_large", "Custom icon exceeds the upload size limit.");
  }

  const source = Buffer.from(await file.arrayBuffer());
  const isPng = source.length >= 8 && source.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isWebp = source.length >= 12 && source.subarray(0, 4).toString("ascii") === "RIFF" && source.subarray(8, 12).toString("ascii") === "WEBP";

  if (!isPng && !isWebp) {
    throw new StudentNavIconUploadError("invalid_type", "Custom icon must be PNG or WebP.");
  }

  let normalized: Buffer;
  try {
    normalized = await sharp(source, { failOn: "error", limitInputPixels: 16_777_216 })
      .rotate()
      .resize(128, 128, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .webp({ quality: 90 })
      .toBuffer();
  } catch {
    throw new StudentNavIconUploadError("invalid_image", "Custom icon could not be decoded.");
  }

  const objectKey = `${objectPrefix}/${randomUUID()}.webp`;
  await uploadAiStudyObject({ key: objectKey, body: normalized, contentType: "image/webp" });
  return objectKey;
}

export function isStudentNavIconObjectKey(value: string, iconKey: StudentNavIconKey) {
  return new RegExp(`^student-nav-icons/${iconKey}/[0-9a-f-]{36}\\.webp$`, "i").test(value);
}

export function isCourseCenterMajorIconObjectKey(value: string) {
  return /^course-center-major-icons\/[0-9a-f-]{36}\.webp$/i.test(value);
}
