import crypto from "crypto";
import type { ReportOnlineMineruStage } from "./ai-study-mineru-stages";
import { parseOnlineMineruImages, parseOnlineMineruPdf } from "./ai-study-mineru-online";
import { getStudyMineruToken, type StudyMineruSelection } from "./ai-study-mineru-settings";

const mineruApiUrl = (process.env.AI_STUDY_MINERU_API_URL || "http://10.11.5.25:8000").replace(/\/+$/, "");
const mineruBackend = process.env.AI_STUDY_MINERU_BACKEND || "hybrid-engine";
type MineruTiming = Pick<StudyMineruSelection, "pollIntervalMs" | "timeoutMs">;

type MineruTaskState = {
  task_id?: string;
  status?: string;
  message?: string;
  error?: string;
};

type MineruFileResult = {
  md_content?: string;
  middle_json?: string | Record<string, unknown>;
  content_list?: string | MineruContentBlock[];
  images?: Record<string, string>;
};

type MineruResultEnvelope = {
  backend?: string;
  version?: string;
  results?: Record<string, MineruFileResult>;
};

export type MineruContentBlock = {
  type?: string;
  text?: string;
  content?: string;
  img_path?: string;
  image_path?: string;
  table_body?: string;
  table_caption?: string | string[];
  table_footnote?: string | string[];
  image_caption?: string | string[];
  image_footnote?: string | string[];
  chart_caption?: string | string[];
  chart_footnote?: string | string[];
  code_body?: string;
  code_caption?: string | string[];
  list_items?: unknown[];
  page_idx?: number;
  page_index?: number;
  bbox?: unknown;
  latex?: string;
  text_level?: number;
  [key: string]: unknown;
};

export type MineruParseResult = {
  backend: string;
  version: string;
  sourceSha256: string;
  markdown: string;
  middleJson: Record<string, unknown>;
  contentList: MineruContentBlock[];
  images: Record<string, Buffer>;
  pageCount: number | null;
  imageFallbackAnalysisCount: number;
  warnings: string[];
};

export async function parsePdfWithMineru(
  input: { body: Buffer; fileName: string },
  selection: StudyMineruSelection,
  reportStage?: ReportOnlineMineruStage
): Promise<MineruParseResult> {
  if (selection.provider === "online") {
    const options = { token: getStudyMineruToken(selection), pollIntervalMs: selection.pollIntervalMs, timeoutMs: selection.timeoutMs };
    const parsed = await parseOnlineMineruPdf(input.body, options, reportStage);
    const result: MineruParseResult = {
      ...parsed,
      backend: "mineru-online-vlm",
      version: "unknown",
      sourceSha256: crypto.createHash("sha256").update(input.body).digest("hex"),
      imageFallbackAnalysisCount: 0,
      warnings: []
    };
    if (selection.onlineImageSupplementEnabled) {
      await enrichBlankImagesWithMineru(result, (files) =>
        parseOnlineMineruImages(files, { ...options, timeoutMs: Math.min(180_000, options.timeoutMs) }),
        () => reportStage?.("enriching_images")
      );
    }
    return result;
  }

  const form = new FormData();
  form.append("files", new Blob([toArrayBuffer(input.body)], { type: "application/pdf" }), input.fileName);
  form.append("backend", mineruBackend);
  form.append("lang_list", "ch");
  form.append("parse_method", "auto");
  form.append("formula_enable", "true");
  form.append("table_enable", "true");
  form.append("image_analysis", "true");
  form.append("effort", "high");
  form.append("return_md", "true");
  form.append("return_middle_json", "true");
  form.append("return_content_list", "true");
  form.append("return_model_output", "false");
  form.append("return_images", "true");
  form.append("response_format_zip", "false");

  const envelope = await submitAndWaitForMineru(form, selection);
  const result = normalizeMineruResult(envelope, input.body);
  await enrichBlankImagesWithMineru(result, (files) => parsePrivateMineruImages(files, selection));
  return result;
}

export function normalizeMineruResult(envelope: MineruResultEnvelope, body: Buffer): MineruParseResult {
  const fileResult = Object.values(envelope.results || {})[0];
  if (!fileResult) {
    throw new Error("MinerU 返回结果中没有文件内容。");
  }

  const middleJson = parseJsonValue<Record<string, unknown>>(fileResult.middle_json, {});
  const contentList = parseJsonValue<MineruContentBlock[]>(fileResult.content_list, []);
  if (contentList.length === 0) {
    throw new Error("MinerU 未解析出可学习内容。");
  }

  const images: Record<string, Buffer> = {};
  for (const [name, dataUrl] of Object.entries(fileResult.images || {})) {
    const match = dataUrl.match(/^data:[^;]+;base64,([\s\S]+)$/);
    if (match) {
      images[name] = Buffer.from(match[1], "base64");
    }
  }

  return {
    backend: envelope.backend || mineruBackend,
    version: envelope.version || "unknown",
    sourceSha256: crypto.createHash("sha256").update(body).digest("hex"),
    markdown: fileResult.md_content || "",
    middleJson,
    contentList,
    images,
    pageCount: readMineruPageCount(middleJson, contentList),
    imageFallbackAnalysisCount: 0,
    warnings: []
  };
}

async function submitAndWaitForMineru(form: FormData, timing: MineruTiming) {
  const deadline = Date.now() + timing.timeoutMs;
  const signal = AbortSignal.timeout(timing.timeoutMs);
  try {
    return await pollPrivateMineru(form, timing, deadline, signal);
  } catch (error) {
    if (signal.aborted) throw new Error(`MinerU 解析超时（${timing.timeoutMs / 1000} 秒）。`);
    throw error;
  }
}

async function pollPrivateMineru(form: FormData, timing: MineruTiming, deadline: number, signal: AbortSignal) {
  const submitted = await fetchJson<MineruTaskState>(`${mineruApiUrl}/tasks`, {
    method: "POST",
    body: form,
    signal
  });
  if (!submitted.task_id) {
    throw new Error(`MinerU 未返回任务 ID：${submitted.message || submitted.error || "未知错误"}`);
  }

  while (Date.now() < deadline) {
    const state = await fetchJson<MineruTaskState>(`${mineruApiUrl}/tasks/${submitted.task_id}`, { signal });
    if (state.status === "completed" || state.status === "success") {
      return fetchJson<MineruResultEnvelope>(`${mineruApiUrl}/tasks/${submitted.task_id}/result`, { signal });
    }
    if (state.status === "failed" || state.status === "error" || state.status === "cancelled") {
      throw new Error(`MinerU 解析失败：${state.message || state.error || state.status}`);
    }
    await delay(Math.min(timing.pollIntervalMs, Math.max(0, deadline - Date.now())));
  }

  throw new Error(`MinerU 解析超时（${timing.timeoutMs / 1000} 秒）。`);
}

async function enrichBlankImagesWithMineru(
  result: MineruParseResult,
  parseImages: (files: { name: string; body: Buffer }[]) => Promise<Map<string, MineruContentBlock[]>>,
  onStart?: () => Promise<void> | undefined
) {
  const candidates = result.contentList.flatMap((block, blockIndex) => {
    if (!isMeaningfulBlankVisual(block)) {
      return [];
    }
    const imagePath = readMineruImagePath(block);
    const body = findMineruImage(result.images, imagePath);
    if (!body) return [];
    const extension = readImageExtension(imagePath);
    return [{ block, body, name: `mineru-image-${blockIndex}.${extension}` }];
  });
  if (candidates.length === 0) {
    return;
  }

  await onStart?.();
  try {
    const parsed = await parseImages(candidates);
    for (const candidate of candidates) {
      const contentList = parsed.get(candidate.name) ?? [];
      const description = readMineruFallbackText(contentList);
      if (description) {
        candidate.block.content = description;
        candidate.block.sub_type = candidate.block.sub_type || "mineru_image_fallback";
        result.imageFallbackAnalysisCount += 1;
      }
    }
    if (result.imageFallbackAnalysisCount < candidates.length) {
      result.warnings.push(`MinerU 有 ${candidates.length - result.imageFallbackAnalysisCount} 张有效图片未生成语义文字。`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    result.warnings.push(`MinerU 图片补充解析失败：${message}`);
  }
}

async function parsePrivateMineruImages(files: { name: string; body: Buffer }[], timing: MineruTiming) {
  const form = new FormData();
  for (const file of files) {
    const extension = readImageExtension(file.name);
    form.append("files", new Blob([toArrayBuffer(file.body)], { type: readImageContentType(extension) }), file.name);
  }
  form.append("backend", mineruBackend);
  form.append("lang_list", "ch");
  form.append("parse_method", "auto");
  form.append("formula_enable", "true");
  form.append("table_enable", "true");
  form.append("image_analysis", "true");
  form.append("effort", "high");
  form.append("return_md", "false");
  form.append("return_middle_json", "false");
  form.append("return_content_list", "true");
  form.append("return_model_output", "false");
  form.append("return_images", "false");
  form.append("response_format_zip", "false");

  const envelope = await submitAndWaitForMineru(form, timing);
  return new Map(files.map(({ name }) => [
    name, parseJsonValue<MineruContentBlock[]>(envelope.results?.[name.slice(0, name.lastIndexOf("."))]?.content_list, [])
  ]));
}

function isMeaningfulBlankVisual(block: MineruContentBlock) {
  if (!['image', 'chart'].includes(String(block.type || '')) || hasMineruSemanticText(block)) {
    return false;
  }
  if (!readMineruImagePath(block)) {
    return false;
  }
  const bbox = Array.isArray(block.bbox) ? block.bbox : [];
  if (bbox.length !== 4 || !bbox.every((value) => typeof value === "number")) {
    return false;
  }
  const [x1, y1, x2, y2] = bbox as number[];
  const maxCoordinate = Math.max(...bbox as number[]);
  const scale = maxCoordinate <= 1.5 ? 1 : 1_000;
  const width = Math.max(0, x2 - x1) / scale;
  const height = Math.max(0, y2 - y1) / scale;
  return (width > 0.1 && height > 0.1) || width * height > 0.01;
}

function hasMineruSemanticText(block: MineruContentBlock) {
  return [
    block.content,
    block.image_caption,
    block.image_footnote,
    block.chart_caption,
    block.chart_footnote
  ].some((value) => Array.isArray(value)
    ? value.some((item) => typeof item === "string" && Boolean(item.trim()))
    : typeof value === "string" && Boolean(value.trim()));
}

function readMineruImagePath(block: MineruContentBlock) {
  return typeof block.img_path === "string"
    ? block.img_path
    : typeof block.image_path === "string" ? block.image_path : "";
}

function findMineruImage(images: Record<string, Buffer>, imagePath: string) {
  const normalized = normalizeMineruPath(imagePath);
  const basename = normalized.split("/").pop() || normalized;
  return Object.entries(images).find(([key]) => {
    const normalizedKey = normalizeMineruPath(key);
    return normalizedKey === normalized || normalizedKey.split("/").pop() === basename;
  })?.[1];
}

function normalizeMineruPath(value: string) {
  return value.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
}

function readImageExtension(path: string) {
  const extension = path.split(".").pop()?.toLowerCase();
  return ["png", "webp", "gif", "jpg", "jpeg"].includes(extension || "") ? extension! : "jpg";
}

function readImageContentType(extension: string) {
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "gif") return "image/gif";
  return "image/jpeg";
}

function readMineruFallbackText(blocks: MineruContentBlock[]) {
  const values = blocks.flatMap((block) => [
    block.text,
    block.content,
    block.table_body,
    block.table_caption,
    block.table_footnote,
    block.image_caption,
    block.image_footnote,
    block.chart_caption,
    block.chart_footnote,
    block.code_caption,
    block.code_body,
    readMineruListItems(block.list_items)
  ].flatMap((value) => Array.isArray(value) ? value : [value]))
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()));
  return Array.from(new Set(values.map((value) => value.trim()))).join("\n\n").slice(0, 12_000);
}

function readMineruListItems(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (Array.isArray(value)) {
    return value.map(readMineruListItems).filter(Boolean).join("\n");
  }
  if (value && typeof value === "object") {
    const item = value as Record<string, unknown>;
    return [item.text, item.content, item.list_items].map(readMineruListItems).filter(Boolean).join("\n");
  }
  return "";
}

function readMineruPageCount(middleJson: Record<string, unknown>, contentList: MineruContentBlock[]) {
  const pdfInfo = middleJson.pdf_info;
  if (Array.isArray(pdfInfo)) {
    return pdfInfo.length;
  }
  const highestPage = contentList.reduce((highest, block) => {
    const page = typeof block.page_idx === "number" ? block.page_idx : block.page_index;
    return typeof page === "number" ? Math.max(highest, page + 1) : highest;
  }, 0);
  return highestPage || null;
}

function parseJsonValue<T>(value: string | T | undefined, fallback: T): T {
  if (typeof value !== "string") {
    return value ?? fallback;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new Error("MinerU 返回的结构化结果不是合法 JSON。");
  }
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => null) as T | { detail?: string; message?: string } | null;
  if (!response.ok) {
    const detail = payload && typeof payload === "object" && ("detail" in payload || "message" in payload)
      ? String(payload.detail || payload.message || "")
      : "";
    throw new Error(`MinerU 接口请求失败（HTTP ${response.status}）：${detail || response.statusText}`);
  }
  if (!payload) {
    throw new Error("MinerU 接口返回空响应。");
  }
  return payload as T;
}

function toArrayBuffer(buffer: Buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
