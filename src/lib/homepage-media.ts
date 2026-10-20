import sharp from "sharp";

const maxImageBytes = 5 * 1024 * 1024;
const maxSavedImageBytes = 1024 * 1024;
const maxVideoBytes = 50 * 1024 * 1024;

export class HomepageMediaError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

type Mp4Box = { type: string; start: number; end: number };

function mp4Boxes(body: Buffer, start: number, end: number): Mp4Box[] {
  const boxes: Mp4Box[] = [];
  for (let offset = start; offset < end;) {
    if (end - offset < 8) throw new Error("Truncated MP4 box");
    let size = body.readUInt32BE(offset);
    let header = 8;
    if (size === 1) {
      if (end - offset < 16) throw new Error("Truncated MP4 extended size");
      size = body.readUInt32BE(offset + 8) * 2 ** 32 + body.readUInt32BE(offset + 12);
      header = 16;
    } else if (size === 0) {
      size = end - offset;
    }
    if (!Number.isSafeInteger(size) || size < header || size > end - offset) throw new Error("Invalid MP4 box size");
    boxes.push({ type: body.toString("ascii", offset + 4, offset + 8), start: offset + header, end: offset + size });
    offset += size;
  }
  return boxes;
}

export function isHomepageMp4(body: Buffer): boolean {
  try {
    const boxes = mp4Boxes(body, 0, body.length);
    const fileType = boxes.find((box) => box.type === "ftyp");
    const movie = boxes.find((box) => box.type === "moov");
    if (!fileType || !movie || fileType.end - fileType.start < 8 || (fileType.end - fileType.start) % 4 !== 0) return false;
    const brands = [body.toString("ascii", fileType.start, fileType.start + 4)];
    for (let offset = fileType.start + 8; offset < fileType.end; offset += 4) brands.push(body.toString("ascii", offset, offset + 4));
    if (brands[0] === "qt  " || !brands.some((brand) => /^(isom|iso[2-9]|mp4[12]|avc1|M4V |dash)$/.test(brand))) return false;
    if (!boxes.some((box) => box.type === "mdat" && box.end > box.start)) return false;
    return mp4Boxes(body, movie.start, movie.end).filter((box) => box.type === "trak").some((track) =>
      mp4Boxes(body, track.start, track.end).filter((box) => box.type === "mdia").some((media) =>
        mp4Boxes(body, media.start, media.end).some((handler) =>
          handler.type === "hdlr" && handler.end - handler.start >= 12 && body.toString("ascii", handler.start + 8, handler.start + 12) === "vide"
        )
      )
    );
  } catch {
    return false;
  }
}

export async function prepareHomepageMedia(file: File): Promise<{ body: Buffer; contentType: string }> {
  if (!file.size) throw new HomepageMediaError("homepage-media-required");
  const isVideo = file.type === "video/mp4" || /\.mp4$/i.test(file.name);
  if (file.size > (isVideo ? maxVideoBytes : maxImageBytes)) throw new HomepageMediaError(isVideo ? "homepage-video-too-large" : "homepage-image-too-large");
  const input = Buffer.from(await file.arrayBuffer());
  if (isVideo) {
    if (!isHomepageMp4(input)) throw new HomepageMediaError("homepage-video-invalid");
    return { body: input, contentType: "video/mp4" };
  }
  let body: Buffer;
  try {
    const metadata = await sharp(input, { limitInputPixels: 24_000_000 }).metadata();
    if (!metadata.format || !["png", "jpeg", "webp"].includes(metadata.format)) throw new Error("Unsupported image format");
    body = await sharp(input, { limitInputPixels: 24_000_000 })
      .rotate()
      .resize({ width: 1600, height: 1200, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82, effort: 5 })
      .toBuffer();
  } catch {
    throw new HomepageMediaError("homepage-media-invalid");
  }
  if (body.byteLength > maxSavedImageBytes) throw new HomepageMediaError("homepage-image-too-large");
  return { body, contentType: "image/webp" };
}

export function parseHomepageMediaRange(value: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2]) || size <= 0) return null;
  if (!match[1]) {
    const suffix = Number(match[2]);
    return Number.isSafeInteger(suffix) && suffix > 0 ? { start: Math.max(0, size - suffix), end: size - 1 } : null;
  }
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start) return null;
  return { start, end: Math.min(end, size - 1) };
}
