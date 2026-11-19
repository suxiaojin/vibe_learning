import { basename } from "node:path/posix";
import { randomUUID } from "node:crypto";
import { fromBufferPromise } from "yauzl";
import { inspectPdf, splitPdfByRanges, type PdfPartRange } from "./ai-study-pdf-parts";
import type { MineruContentBlock } from "./ai-study-mineru";
import type { ReportOnlineMineruStage } from "./ai-study-mineru-stages";

const apiBase = "https://mineru.net/api/v4";
const maxPdfPages = 200;
const maxFileBytes = 200_000_000;
const maxArchiveBytes = 256 * 1024 * 1024;
const batchSize = 50;

type OnlineFile = { name: string; body: Buffer };
type BatchResult = { data_id?: string; file_name?: string; state: string; full_zip_url?: string; err_msg?: string };
type ParseOptions = { token: string; pollIntervalMs: number; timeoutMs: number };

export async function parseOnlineMineruPdf(body: Buffer, options: ParseOptions, reportStage?: ReportOnlineMineruStage) {
  await reportStage?.("preparing");
  const { pageCount } = await inspectPdf(body, false);
  if (pageCount < 1) throw new Error("PDF 没有可解析的页面。");
  const ranges: PdfPartRange[] = [];
  for (let startPage = 1; startPage <= pageCount; startPage += maxPdfPages) {
    ranges.push({ index: ranges.length + 1, startPage, endPage: Math.min(pageCount, startPage + maxPdfPages - 1) });
  }
  const parts = ranges.length === 1 ? [body] : await splitPdfByRanges(body, ranges);
  const files = parts.map((part, index) => ({ name: `part-${index + 1}.pdf`, body: part }));
  const markdown: string[] = [];
  const contentList: MineruContentBlock[] = [];
  const layouts: { startPage: number; endPage: number; layout: Record<string, unknown> }[] = [];
  const images: Record<string, Buffer> = {};
  const deadline = Date.now() + options.timeoutMs;

  for (let start = 0; start < files.length; start += batchSize) {
    const batch = files.slice(start, start + batchSize);
    const results = await parseBatch(batch, options, deadline, reportStage);
    await reportStage?.("downloading");
    for (const [index, result] of results.entries()) {
      const range = ranges[start + index];
      const archive = await readArchive(result, deadline, true);
      const paths = new Map<string, string>();
      for (const [path, image] of Object.entries(archive.images)) {
        const name = `images/part-${range.index}-${basename(path)}`;
        images[name] = image;
        paths.set(basename(path), name);
      }
      const offset = range.startPage - 1;
      for (const block of archive.contentList) {
        const page = block.page_idx ?? block.page_index;
        if (typeof page !== "number" || !Number.isInteger(page) || page < 0 || page > range.endPage - range.startPage) {
          throw new Error(`MinerU 在线解析第 ${range.index} 段返回了无效页码。`);
        }
        const imagePath = block.img_path || block.image_path;
        const mapped = imagePath ? paths.get(basename(imagePath)) : undefined;
        contentList.push({ ...block, page_idx: page + offset, ...(mapped ? { img_path: mapped } : {}) });
      }
      markdown.push(archive.markdown.replace(/\bimages\/[^\s)"'<>]+/g, (path) => paths.get(basename(path)) ?? path));
      layouts.push({ startPage: range.startPage, endPage: range.endPage, layout: archive.layout });
    }
  }
  if (!contentList.length) throw new Error("MinerU 在线 API 未解析出可学习内容。");
  return {
    pageCount, contentList, images, markdown: markdown.join("\n\n"),
    middleJson: layouts.length === 1 ? layouts[0].layout : { parts: layouts }
  };
}

export async function parseOnlineMineruImages(files: OnlineFile[], options: ParseOptions) {
  const results = new Map<string, MineruContentBlock[]>();
  const deadline = Date.now() + options.timeoutMs;
  for (let start = 0; start < files.length; start += batchSize) {
    const batch = files.slice(start, start + batchSize);
    const parsed = await parseBatch(batch, options, deadline);
    for (const [index, result] of parsed.entries()) {
      const archive = await readArchive(result, deadline, false);
      results.set(batch[index].name, archive.contentList);
    }
  }
  return results;
}

async function parseBatch(files: OnlineFile[], options: ParseOptions, deadline: number, reportStage?: ReportOnlineMineruStage) {
  if (files.some((file) => file.body.length > maxFileBytes)) {
    throw new Error("MinerU 在线 API 单个文件最大 200 MB，请先压缩 PDF。");
  }
  const inputs = files.map(({ name }) => ({ name, data_id: randomUUID() }));
  await reportStage?.("uploading");
  const batch = await requestApi<{ batch_id: string; file_urls: string[] }>("/file-urls/batch", options.token, deadline, {
    method: "POST",
    body: JSON.stringify({ files: inputs, model_version: "vlm", language: "ch", enable_formula: true, enable_table: true })
  });
  if (!batch.batch_id || !Array.isArray(batch.file_urls) || batch.file_urls.length !== files.length) {
    throw new Error("MinerU 在线 API 未返回完整的上传链接。");
  }
  for (const [index, file] of files.entries()) {
    const response = await request(signedUrl(batch.file_urls[index]), deadline, {
      method: "PUT",
      body: new Uint8Array(file.body)
    }, 180_000);
    await response.body?.cancel();
    if (!response.ok) throw new Error(`MinerU 文件上传失败（HTTP ${response.status}）。`);
  }

  await reportStage?.("waiting");
  while (Date.now() < deadline) {
    const { extract_result: results } = await requestApi<{ extract_result: BatchResult[] }>(
      `/extract-results/batch/${encodeURIComponent(batch.batch_id)}`, options.token, deadline
    );
    const ordered = inputs.map((input) =>
      results?.find((item) => item.data_id === input.data_id || (!item.data_id && item.file_name === input.name))
    );
    const failed = ordered.find((item) => item?.state === "failed");
    if (failed) throw new Error(`MinerU 在线解析失败：${failed.err_msg?.slice(0, 300) || "请重试或检查文件。"}`);
    if (ordered.every((item): item is BatchResult => item?.state === "done")) return ordered;
    await new Promise((resolve) => setTimeout(resolve, Math.min(options.pollIntervalMs, Math.max(0, deadline - Date.now()))));
  }
  throw new Error("MinerU 在线解析超时。");
}

async function requestApi<T>(path: string, token: string, deadline: number, init?: RequestInit) {
  const response = await request(apiBase + path, deadline, {
    ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
  });
  const payload = await response.json().catch(() => null) as { code: number | string; data: T; trace_id?: string } | null;
  if (!response.ok || payload?.code !== 0 || !payload.data) {
    const trace = /^[a-z0-9-]{1,64}$/i.test(payload?.trace_id ?? "") ? `，请求 ID ${payload?.trace_id}` : "";
    throw new Error(`MinerU 在线 API 请求失败（HTTP ${response.status}，错误码 ${payload?.code ?? "未知"}${trace}）。`);
  }
  return payload.data;
}

async function request(url: string, deadline: number, init?: RequestInit, requestTimeoutMs = 30_000) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error("MinerU 在线解析超时。");
  try {
    return await fetch(url, { ...init, cache: "no-store", redirect: "error",
      signal: AbortSignal.timeout(Math.min(requestTimeoutMs, remaining)) });
  } catch {
    throw new Error("连接 MinerU 在线服务失败或请求超时。");
  }
}

function signedUrl(value: string | undefined) {
  const url = URL.parse(value ?? "");
  if (!url || url.protocol !== "https:" || url.username || url.password || url.port ||
      !(/^(mineru\.net|[\w-]+\.mineru\.net|cdn-mineru\.openxlab\.org\.cn|mineru\.oss-[\w-]+\.aliyuncs\.com)$/.test(url.hostname))) {
    throw new Error("MinerU 在线 API 返回了不受支持的文件链接。");
  }
  return url.href;
}

async function readArchive(result: BatchResult, deadline: number, includeArtifacts: boolean) {
  const response = await request(signedUrl(result.full_zip_url), deadline, undefined, 180_000);
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new Error(`MinerU 结果下载失败（HTTP ${response.status}）。`);
  }
  const compressed: Buffer[] = [];
  let downloaded = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      downloaded += value.byteLength;
      if (downloaded > maxArchiveBytes) throw new Error("MinerU 在线解析结果压缩包过大。");
      compressed.push(Buffer.from(value));
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  const zip = await fromBufferPromise(Buffer.concat(compressed, downloaded));
  let contentList: MineruContentBlock[] | undefined;
  let markdown = "";
  let layout: Record<string, unknown> = {};
  const images: Record<string, Buffer> = {};
  let uncompressed = 0;
  for await (const entry of zip.eachEntry()) {
    const name = basename(entry.fileName);
    const isContent = name === "content_list.json" || name.endsWith("_content_list.json");
    const isLayout = name === "layout.json" || name === "middle.json" || name.endsWith("_middle.json");
    const isImage = /(?:^|\/)images\//.test(entry.fileName) && /\.(png|jpe?g|webp|gif|bmp)$/i.test(name);
    if (!isContent && !(includeArtifacts && (isLayout || name === "full.md" || isImage))) continue;
    uncompressed += entry.uncompressedSize;
    if (uncompressed > maxArchiveBytes) throw new Error("MinerU 在线解析结果解压后过大。");
    const chunks: Buffer[] = [];
    for await (const chunk of await zip.openReadStreamPromise(entry)) chunks.push(chunk);
    const data = Buffer.concat(chunks);
    if (isImage) images[entry.fileName] = data;
    else if (name === "full.md") markdown = data.toString("utf8");
    else if (isLayout) layout = JSON.parse(data.toString("utf8"));
    else if (isContent) contentList = JSON.parse(data.toString("utf8"));
  }
  if (!Array.isArray(contentList) || contentList.some((block) => !block || typeof block !== "object" || Array.isArray(block))) {
    throw new Error("MinerU 在线结果缺少可用的 content_list.json。");
  }
  return { contentList, markdown, layout, images };
}
