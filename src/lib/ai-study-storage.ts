import crypto from "crypto";

type UploadObjectInput = {
  key: string;
  body: Buffer;
  contentType: string;
};

type UploadObjectResult = {
  bucket: string;
  key: string;
  storagePath: string;
  etag: string | null;
};

type DownloadObjectResult = {
  body: Buffer;
  contentType: string;
};

type AiStudyStorageConfig = {
  endpoint: string;
  bucket: string;
  region: string;
  accessKey: string;
  secretKey: string;
  forcePathStyle: boolean;
};

export function getAiStudyStorageConfig(): AiStudyStorageConfig {
  const endpoint = (process.env.AI_STUDY_S3_ENDPOINT || "http://minio:9000").replace(/\/+$/, "");
  const bucket = process.env.AI_STUDY_S3_BUCKET || "vibe-ai-study";
  const accessKey = process.env.AI_STUDY_S3_ACCESS_KEY || process.env.MINIO_ROOT_USER || "";
  const secretKey = process.env.AI_STUDY_S3_SECRET_KEY || process.env.MINIO_ROOT_PASSWORD || "";

  if (!accessKey || !secretKey) {
    throw new Error("AI_STUDY_S3_ACCESS_KEY and AI_STUDY_S3_SECRET_KEY are required.");
  }

  return {
    endpoint,
    bucket,
    accessKey,
    secretKey,
    region: process.env.AI_STUDY_S3_REGION || "us-east-1",
    forcePathStyle: process.env.AI_STUDY_S3_FORCE_PATH_STYLE !== "false"
  };
}

export async function uploadAiStudyObject(input: UploadObjectInput): Promise<UploadObjectResult> {
  const config = getAiStudyStorageConfig();
  if (!config.forcePathStyle) {
    throw new Error("AI study MinIO storage currently requires AI_STUDY_S3_FORCE_PATH_STYLE=true.");
  }

  const payloadHash = sha256Hex(input.body);
  const now = new Date();
  const amzDate = toAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const canonicalUri = `/${encodePathSegment(config.bucket)}/${encodeObjectKey(input.key)}`;
  const url = new URL(`${config.endpoint}${canonicalUri}`);
  const host = url.host;
  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
  const canonicalHeaders = [
    `content-type:${input.contentType}`,
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`
  ].join("\n") + "\n";
  const canonicalRequest = [
    "PUT",
    canonicalUri,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join("\n");
  const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest)
  ].join("\n");
  const signingKey = getSignatureKey(config.secretKey, dateStamp, config.region, "s3");
  const signature = hmacHex(signingKey, stringToSign);
  const requestBody = input.body.buffer.slice(input.body.byteOffset, input.body.byteOffset + input.body.byteLength) as ArrayBuffer;

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      "Content-Type": input.contentType,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate
    },
    body: requestBody
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`MinIO upload failed with ${response.status}: ${detail.slice(0, 600)}`);
  }

  return {
    bucket: config.bucket,
    key: input.key,
    storagePath: `s3://${config.bucket}/${input.key}`,
    etag: response.headers.get("etag")
  };
}

export async function downloadAiStudyObject(key: string): Promise<DownloadObjectResult> {
  const config = getAiStudyStorageConfig();
  if (!config.forcePathStyle) {
    throw new Error("AI study MinIO storage currently requires AI_STUDY_S3_FORCE_PATH_STYLE=true.");
  }

  const payloadHash = sha256Hex("");
  const now = new Date();
  const amzDate = toAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const canonicalUri = `/${encodePathSegment(config.bucket)}/${encodeObjectKey(key)}`;
  const url = new URL(`${config.endpoint}${canonicalUri}`);
  const host = url.host;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalHeaders = [
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`
  ].join("\n") + "\n";
  const canonicalRequest = [
    "GET",
    canonicalUri,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join("\n");
  const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest)
  ].join("\n");
  const signingKey = getSignatureKey(config.secretKey, dateStamp, config.region, "s3");
  const signature = hmacHex(signingKey, stringToSign);

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate
    }
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`MinIO download failed with ${response.status}: ${detail.slice(0, 600)}`);
  }

  return {
    body: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") || "application/octet-stream"
  };
}

function encodeObjectKey(key: string) {
  return key.split("/").map(encodePathSegment).join("/");
}

function encodePathSegment(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function sha256Hex(value: crypto.BinaryLike) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hmac(key: crypto.BinaryLike, value: string) {
  return crypto.createHmac("sha256", key).update(value).digest();
}

function hmacHex(key: crypto.BinaryLike, value: string) {
  return crypto.createHmac("sha256", key).update(value).digest("hex");
}

function getSignatureKey(secretKey: string, dateStamp: string, regionName: string, serviceName: string) {
  const kDate = hmac(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmac(kDate, regionName);
  const kService = hmac(kRegion, serviceName);
  return hmac(kService, "aws4_request");
}

function toAmzDate(date: Date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}
