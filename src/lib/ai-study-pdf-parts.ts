import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type PdfPartRange = { index: number; startPage: number; endPage: number };

const defaultTargetPages = 200;
const defaultSplitThreshold = 260;

export function planPdfParts(pageCount: number, outlinePages: number[], targetPages = defaultTargetPages, threshold = defaultSplitThreshold): PdfPartRange[] {
  if (!Number.isInteger(pageCount) || pageCount < 1) throw new Error("PDF 页数无效。");
  if (pageCount < threshold) return [{ index: 1, startPage: 1, endPage: pageCount }];
  const count = Math.ceil(pageCount / targetPages);
  const boundaries = [...new Set(outlinePages.filter((page) => Number.isInteger(page) && page > 1 && page <= pageCount))].sort((a, b) => a - b);
  const starts = [1];
  for (let part = 1; part < count; part += 1) {
    const ideal = Math.round((pageCount * part) / count) + 1;
    const minimum = starts[starts.length - 1] + Math.max(50, Math.round(targetPages * 0.55));
    const maximum = pageCount - (count - part) * Math.max(50, Math.round(targetPages * 0.55)) + 1;
    const candidate = boundaries
      .filter((page) => page >= minimum && page <= maximum && Math.abs(page - ideal) <= Math.round(targetPages * 0.4))
      .sort((a, b) => Math.abs(a - ideal) - Math.abs(b - ideal))[0];
    starts.push(candidate ?? Math.max(minimum, Math.min(ideal, maximum)));
  }
  return starts.map((startPage, offset) => ({
    index: offset + 1,
    startPage,
    endPage: (starts[offset + 1] ?? pageCount + 1) - 1
  }));
}

export async function inspectAndSplitPdf(body: Buffer): Promise<{ ranges: PdfPartRange[]; parts: Buffer[] }> {
  const { pageCount, outlinePages } = await inspectPdf(body);
  const target = Math.max(80, readPositiveInt(process.env.AI_STUDY_PDF_PART_TARGET_PAGES, defaultTargetPages));
  const threshold = Math.max(target + 1, readPositiveInt(process.env.AI_STUDY_PDF_SPLIT_THRESHOLD_PAGES, defaultSplitThreshold));
  if (pageCount < threshold) return { ranges: planPdfParts(pageCount, [], target, threshold), parts: [body] };
  const ranges = planPdfParts(pageCount, outlinePages, target, threshold);
  const directory = await mkdtemp(join(tmpdir(), "ai-study-pdf-parts-"));
  const inputPath = join(directory, "source.pdf");
  const parts: Buffer[] = [];
  try {
    await writeFile(inputPath, body, { mode: 0o600 });
    for (const range of ranges) {
      const outputPath = join(directory, `part-${range.index}.pdf`);
      try {
        await execFileAsync("qpdf", ["--empty", "--pages", inputPath, `${range.startPage}-${range.endPage}`, "--", outputPath], {
          timeout: 120_000,
          maxBuffer: 1024 * 1024
        });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`PDF 第 ${range.index} 部分拆分失败：${detail}`);
      }
      const part = await readFile(outputPath);
      if (part.length === 0) throw new Error(`PDF 第 ${range.index} 部分为空。`);
      parts.push(part);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  return { ranges, parts };
}

async function inspectPdf(body: Buffer): Promise<{ pageCount: number; outlinePages: number[] }> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loading = getDocument({ data: new Uint8Array(body), useSystemFonts: false, disableFontFace: true });
  const document = await loading.promise;
  try {
    const outlinePages: number[] = [];
    try {
      const outline = await document.getOutline();
      for (const item of outline ?? []) {
        const destination = typeof item.dest === "string" ? await document.getDestination(item.dest) : item.dest;
        const reference = Array.isArray(destination) ? destination[0] : null;
        if (typeof reference === "number") outlinePages.push(reference + 1);
        else if (reference && typeof reference === "object") outlinePages.push((await document.getPageIndex(reference)) + 1);
      }
    } catch (error) {
      console.warn("PDF 书签读取失败，按页数拆分：", error);
    }
    return { pageCount: document.numPages, outlinePages };
  } finally {
    await loading.destroy();
  }
}

function readPositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
