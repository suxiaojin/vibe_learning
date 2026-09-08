import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

export const aiServerSettingsId = "default";
export const aiServerModes = ["built_in", "custom"] as const;

export type AiServerMode = (typeof aiServerModes)[number];

export type ActiveAiServerConfig = {
  mode: AiServerMode;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
};

export type AdminAiServerSettings = {
  mode: AiServerMode;
  builtIn: Omit<ActiveAiServerConfig, "apiKey"> & { apiKeyConfigured: boolean };
  custom: Omit<ActiveAiServerConfig, "apiKey"> & { apiKeyConfigured: boolean };
  active: Omit<ActiveAiServerConfig, "apiKey"> & { apiKeyConfigured: boolean };
};

const defaultBuiltInModel = "qwen3.5";
const encryptedValuePrefix = "v1";

function getBuiltInAiServerConfig(): ActiveAiServerConfig {
  return {
    mode: "built_in",
    name: "内置 AI 服务器",
    baseUrl: String(process.env.QWEN_API_BASE_URL || "").trim().replace(/\/+$/, ""),
    apiKey: String(process.env.QWEN_API_KEY || "").trim(),
    model: String(process.env.QWEN_MODEL || defaultBuiltInModel).trim() || defaultBuiltInModel
  };
}

function getEncryptionKey() {
  const secret = process.env.AI_SERVER_CONFIG_SECRET || process.env.AUTH_SECRET || "";
  if (Buffer.byteLength(secret, "utf8") < 24) {
    throw new Error("AI_SERVER_CONFIG_SECRET or AUTH_SECRET must be at least 24 UTF-8 bytes.");
  }
  return createHash("sha256").update(secret, "utf8").digest();
}

export function normalizeAiBaseUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "").replace(/\/chat\/completions$/i, "");
  if (!trimmed) {
    return "";
  }
  const parsed = new URL(trimmed);
  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error("Invalid AI API base URL.");
  }
  return parsed.toString().replace(/\/+$/, "");
}

export function encryptAiApiKey(value: string) {
  const apiKey = value.trim();
  if (!apiKey) {
    return "";
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [encryptedValuePrefix, iv.toString("base64url"), authTag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptAiApiKey(value: string) {
  if (!value) {
    return "";
  }
  const [version, ivValue, authTagValue, ciphertextValue, ...rest] = value.split(".");
  if (version !== encryptedValuePrefix || !ivValue || !authTagValue || !ciphertextValue || rest.length > 0) {
    throw new Error("Stored AI API key format is invalid.");
  }
  const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(authTagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

async function readAiServerSetting() {
  try {
    return await prisma.aiServerSetting.findUnique({ where: { id: aiServerSettingsId } });
  } catch (error) {
    console.error("Failed to load AI server settings, using built-in configuration.", error);
    return null;
  }
}

export async function getActiveAiServerConfig(): Promise<ActiveAiServerConfig> {
  const builtIn = getBuiltInAiServerConfig();
  const setting = await readAiServerSetting();
  if (setting?.mode !== "custom" || !setting.customBaseUrl.trim() || !setting.customModel.trim()) {
    if (!builtIn.baseUrl) {
      throw new Error("QWEN_API_BASE_URL is not configured.");
    }
    return builtIn;
  }

  return {
    mode: "custom",
    name: setting.customName.trim() || "自定义 AI 服务器",
    baseUrl: normalizeAiBaseUrl(setting.customBaseUrl),
    apiKey: decryptAiApiKey(setting.customApiKeyEncrypted),
    model: setting.customModel.trim()
  };
}

export async function getAdminAiServerSettings(): Promise<AdminAiServerSettings> {
  const builtIn = getBuiltInAiServerConfig();
  const setting = await readAiServerSetting();
  const custom = {
    mode: "custom" as const,
    name: setting?.customName || "",
    baseUrl: setting?.customBaseUrl || "",
    model: setting?.customModel || "",
    apiKeyConfigured: Boolean(setting?.customApiKeyEncrypted)
  };
  const mode: AiServerMode = setting?.mode === "custom" && custom.baseUrl.trim() && custom.model.trim()
    ? "custom"
    : "built_in";
  const builtInSummary = {
    mode: "built_in" as const,
    name: builtIn.name,
    baseUrl: builtIn.baseUrl,
    model: builtIn.model,
    apiKeyConfigured: Boolean(builtIn.apiKey)
  };

  return {
    mode,
    builtIn: builtInSummary,
    custom,
    active: mode === "custom" ? custom : builtInSummary
  };
}
