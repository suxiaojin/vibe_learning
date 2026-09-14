import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const aiServerSettingsId = "default";
export const builtInAiServerProfileId = "built_in";
export const legacyCustomAiServerProfileId = "legacy_custom";

export const aiModuleDefinitions = [
  { key: "course_ai_explanation", group: "课程闯关", label: "AI解释" },
  { key: "course_ai_follow_up", group: "课程闯关", label: "AI追问" },
  { key: "special_practice_ai_doubt", group: "专项练习", label: "AI答疑" },
  { key: "special_practice_ai_follow_up", group: "专项练习", label: "AI追问" },
  { key: "ai_study_generation", group: "学习搭子", label: "学习搭子生成" },
  { key: "ai_study_chat", group: "学习搭子", label: "问问搭子" },
  { key: "question_bank_ai_tagging", group: "题库管理", label: "AI打标" },
  { key: "question_bank_ai_doubt_draft", group: "题库管理", label: "题目详情AI答疑草稿" },
  { key: "question_bank_ai_generation", group: "题库管理", label: "AI生题" },
  { key: "question_bank_pdf_ai_review", group: "题库管理", label: "PDF解析AI复核" }
] as const;

export type AiModuleKey = (typeof aiModuleDefinitions)[number]["key"];
export type AiServerMode = "built_in" | "custom";

export type ActiveAiServerConfig = {
  id: string;
  mode: AiServerMode;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
};

export type AdminAiServerProfile = Omit<ActiveAiServerConfig, "apiKey"> & {
  enabled: boolean;
  apiKeyConfigured: boolean;
};

export type AdminAiModuleRoute = (typeof aiModuleDefinitions)[number] & {
  serverIds: string[];
};

export type AdminAiServerSettings = {
  builtIn: AdminAiServerProfile;
  customServers: AdminAiServerProfile[];
  moduleRoutes: AdminAiModuleRoute[];
};

type StoredAiServerProfile = {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  apiKeyEncrypted: string;
  enabled: boolean;
};

type AiServerSettingRecord = {
  mode: string;
  customName: string;
  customBaseUrl: string;
  customModel: string;
  customApiKeyEncrypted: string;
  customServers: unknown;
  moduleRoutes: unknown;
};

export type SaveCustomAiServerInput = {
  id?: string;
  name: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  clearApiKey: boolean;
  enabled: boolean;
};

export type AiServerMutationError =
  | "ai-server-value-too-long"
  | "invalid-ai-server-url"
  | "custom-ai-server-required"
  | "ai-server-secret-unavailable"
  | "ai-server-not-found"
  | "ai-server-in-use"
  | "invalid-ai-module-routes";

export type AiServerMutationResult =
  | { ok: true }
  | { ok: false; error: AiServerMutationError };

const defaultBuiltInModel = "qwen3.5";
const encryptedValuePrefix = "v1";
const aiModuleKeySet = new Set<string>(aiModuleDefinitions.map((item) => item.key));
const aiModuleRoundRobinIndexes = new Map<AiModuleKey, number>();

function getBuiltInAiServerConfig(): ActiveAiServerConfig {
  return {
    id: builtInAiServerProfileId,
    mode: "built_in",
    name: "内置 AI 服务器 88",
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseCustomServers(value: unknown): StoredAiServerProfile[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  return value.flatMap((item) => {
    if (!isPlainObject(item)) {
      return [];
    }
    const id = typeof item.id === "string" ? item.id.trim() : "";
    const name = typeof item.name === "string" ? item.name.trim() : "";
    const baseUrl = typeof item.baseUrl === "string" ? item.baseUrl.trim() : "";
    const model = typeof item.model === "string" ? item.model.trim() : "";
    const apiKeyEncrypted = typeof item.apiKeyEncrypted === "string" ? item.apiKeyEncrypted : "";
    if (!id || !name || !baseUrl || !model || id === builtInAiServerProfileId || seen.has(id)) {
      return [];
    }
    seen.add(id);
    return [{ id, name, baseUrl, model, apiKeyEncrypted, enabled: item.enabled !== false }];
  });
}

function parseModuleRoutes(value: unknown): Partial<Record<AiModuleKey, string[]>> {
  if (!isPlainObject(value)) {
    return {};
  }
  return Object.fromEntries(Object.entries(value).flatMap(([key, storedServerIds]) => {
    if (!aiModuleKeySet.has(key)) {
      return [];
    }
    const serverIds = (Array.isArray(storedServerIds) ? storedServerIds : [storedServerIds])
      .filter((serverId): serverId is string => typeof serverId === "string")
      .map((serverId) => serverId.trim())
      .filter(Boolean);
    const uniqueServerIds = Array.from(new Set(serverIds));
    return uniqueServerIds.length > 0 ? [[key, uniqueServerIds]] : [];
  })) as Partial<Record<AiModuleKey, string[]>>;
}

function getLegacyCustomServer(setting: AiServerSettingRecord | null): StoredAiServerProfile | null {
  if (!setting?.customName.trim() || !setting.customBaseUrl.trim() || !setting.customModel.trim()) {
    return null;
  }
  return {
    id: legacyCustomAiServerProfileId,
    name: setting.customName.trim(),
    baseUrl: setting.customBaseUrl.trim(),
    model: setting.customModel.trim(),
    apiKeyEncrypted: setting.customApiKeyEncrypted,
    enabled: true
  };
}

function getCustomServers(setting: AiServerSettingRecord | null) {
  const stored = parseCustomServers(setting?.customServers);
  if (stored.length > 0) {
    return stored;
  }
  const legacy = getLegacyCustomServer(setting);
  return legacy ? [legacy] : [];
}

function getDefaultServerId(setting: AiServerSettingRecord | null, customServers: StoredAiServerProfile[]) {
  if (setting?.mode === "custom") {
    const legacy = customServers.find((server) => server.id === legacyCustomAiServerProfileId && server.enabled);
    if (legacy) {
      return legacy.id;
    }
  }
  return builtInAiServerProfileId;
}

function getEffectiveRoutes(setting: AiServerSettingRecord | null, customServers: StoredAiServerProfile[]) {
  const storedRoutes = parseModuleRoutes(setting?.moduleRoutes);
  const defaultServerId = getDefaultServerId(setting, customServers);
  return Object.fromEntries(
    aiModuleDefinitions.map((module) => [module.key, storedRoutes[module.key] || [defaultServerId]])
  ) as Record<AiModuleKey, string[]>;
}

function getRoundRobinServerIds(moduleKey: AiModuleKey, serverIds: string[]) {
  const currentIndex = aiModuleRoundRobinIndexes.get(moduleKey) || 0;
  aiModuleRoundRobinIndexes.set(moduleKey, (currentIndex + 1) % serverIds.length);
  const startIndex = currentIndex % serverIds.length;
  return [...serverIds.slice(startIndex), ...serverIds.slice(0, startIndex)];
}

async function readAiServerSetting() {
  try {
    return await prisma.aiServerSetting.findUnique({ where: { id: aiServerSettingsId } });
  } catch (error) {
    console.error("Failed to load AI server settings, using built-in configuration.", error);
    return null;
  }
}

async function writeAiServerSetting(
  customServers: StoredAiServerProfile[],
  moduleRoutes?: Partial<Record<AiModuleKey, string[]>>,
  legacyPatch: Partial<Pick<AiServerSettingRecord, "customName" | "customBaseUrl" | "customModel" | "customApiKeyEncrypted">> = {}
) {
  const data = {
    customServers: customServers as unknown as Prisma.InputJsonValue,
    ...(moduleRoutes ? { moduleRoutes: moduleRoutes as Prisma.InputJsonValue } : {}),
    ...legacyPatch
  };
  await prisma.aiServerSetting.upsert({
    where: { id: aiServerSettingsId },
    update: data,
    create: { id: aiServerSettingsId, ...data }
  });
}

export async function getAiServerConfigsForModule(moduleKey: AiModuleKey): Promise<ActiveAiServerConfig[]> {
  if (!aiModuleKeySet.has(moduleKey)) {
    throw new Error(`Unknown AI module: ${moduleKey}`);
  }
  const builtIn = getBuiltInAiServerConfig();
  const setting = await readAiServerSetting();
  const customServers = getCustomServers(setting);
  const orderedServerIds = getRoundRobinServerIds(
    moduleKey,
    getEffectiveRoutes(setting, customServers)[moduleKey]
  );
  const configs = orderedServerIds.flatMap<ActiveAiServerConfig>((serverId) => {
    if (serverId === builtInAiServerProfileId) {
      return builtIn.baseUrl ? [builtIn] : [];
    }

    const custom = customServers.find((server) => server.id === serverId);
    if (!custom || !custom.enabled) {
      return [];
    }
    return [{
      id: custom.id,
      mode: "custom",
      name: custom.name,
      baseUrl: normalizeAiBaseUrl(custom.baseUrl),
      apiKey: decryptAiApiKey(custom.apiKeyEncrypted),
      model: custom.model
    }];
  });

  if (configs.length === 0) {
    throw new Error(`No available AI server is assigned to ${moduleKey}.`);
  }
  return configs;
}

export async function getAiServerConfigForModule(moduleKey: AiModuleKey): Promise<ActiveAiServerConfig> {
  if (!aiModuleKeySet.has(moduleKey)) {
    throw new Error(`Unknown AI module: ${moduleKey}`);
  }
  const builtIn = getBuiltInAiServerConfig();
  const setting = await readAiServerSetting();
  const customServers = getCustomServers(setting);
  const [serverId] = getRoundRobinServerIds(moduleKey, getEffectiveRoutes(setting, customServers)[moduleKey]);

  if (serverId === builtInAiServerProfileId) {
    if (!builtIn.baseUrl) {
      throw new Error("QWEN_API_BASE_URL is not configured.");
    }
    return builtIn;
  }

  const custom = customServers.find((server) => server.id === serverId);
  if (!custom || !custom.enabled) {
    throw new Error(`AI server assigned to ${moduleKey} is unavailable.`);
  }
  return {
    id: custom.id,
    mode: "custom",
    name: custom.name,
    baseUrl: normalizeAiBaseUrl(custom.baseUrl),
    apiKey: decryptAiApiKey(custom.apiKeyEncrypted),
    model: custom.model
  };
}

export async function getAdminAiServerSettings(): Promise<AdminAiServerSettings> {
  const builtIn = getBuiltInAiServerConfig();
  const setting = await readAiServerSetting();
  const customServers = getCustomServers(setting);
  const routes = getEffectiveRoutes(setting, customServers);
  return {
    builtIn: {
      id: builtIn.id,
      mode: builtIn.mode,
      name: builtIn.name,
      baseUrl: builtIn.baseUrl,
      model: builtIn.model,
      enabled: true,
      apiKeyConfigured: Boolean(builtIn.apiKey)
    },
    customServers: customServers.map((server) => ({
      id: server.id,
      mode: "custom",
      name: server.name,
      baseUrl: server.baseUrl,
      model: server.model,
      enabled: server.enabled,
      apiKeyConfigured: Boolean(server.apiKeyEncrypted)
    })),
    moduleRoutes: aiModuleDefinitions.map((module) => ({ ...module, serverIds: routes[module.key] }))
  };
}

export async function saveCustomAiServer(input: SaveCustomAiServerInput): Promise<AiServerMutationResult> {
  const name = input.name.trim();
  const model = input.model.trim();
  const apiKey = input.apiKey.trim();
  if (name.length > 80 || input.baseUrl.length > 1000 || model.length > 160 || apiKey.length > 8192) {
    return { ok: false, error: "ai-server-value-too-long" };
  }
  let baseUrl = "";
  try {
    baseUrl = normalizeAiBaseUrl(input.baseUrl);
  } catch {
    return { ok: false, error: "invalid-ai-server-url" };
  }
  if (!name || !baseUrl || !model) {
    return { ok: false, error: "custom-ai-server-required" };
  }

  const setting = await prisma.aiServerSetting.findUnique({ where: { id: aiServerSettingsId } });
  const customServers = getCustomServers(setting);
  const existingIndex = input.id ? customServers.findIndex((server) => server.id === input.id) : -1;
  if (input.id && existingIndex < 0) {
    return { ok: false, error: "ai-server-not-found" };
  }
  const existing = existingIndex >= 0 ? customServers[existingIndex] : null;
  const routes = getEffectiveRoutes(setting, customServers);
  if (!input.enabled && existing && Object.values(routes).some((serverIds) => serverIds.includes(existing.id))) {
    return { ok: false, error: "ai-server-in-use" };
  }

  let apiKeyEncrypted = existing?.apiKeyEncrypted || "";
  if (input.clearApiKey) {
    apiKeyEncrypted = "";
  } else if (apiKey) {
    try {
      apiKeyEncrypted = encryptAiApiKey(apiKey);
    } catch {
      return { ok: false, error: "ai-server-secret-unavailable" };
    }
  }

  const saved: StoredAiServerProfile = {
    id: existing?.id || `custom_${randomUUID()}`,
    name,
    baseUrl,
    model,
    apiKeyEncrypted,
    enabled: input.enabled
  };
  if (existingIndex >= 0) {
    customServers[existingIndex] = saved;
  } else {
    customServers.push(saved);
  }
  await writeAiServerSetting(
    customServers,
    undefined,
    saved.id === legacyCustomAiServerProfileId
      ? { customName: saved.name, customBaseUrl: saved.baseUrl, customModel: saved.model, customApiKeyEncrypted: saved.apiKeyEncrypted }
      : {}
  );
  return { ok: true };
}

export async function deleteCustomAiServer(serverId: string): Promise<AiServerMutationResult> {
  const setting = await prisma.aiServerSetting.findUnique({ where: { id: aiServerSettingsId } });
  const customServers = getCustomServers(setting);
  const target = customServers.find((server) => server.id === serverId);
  if (!target) {
    return { ok: false, error: "ai-server-not-found" };
  }
  const routes = getEffectiveRoutes(setting, customServers);
  if (Object.values(routes).some((serverIds) => serverIds.includes(serverId))) {
    return { ok: false, error: "ai-server-in-use" };
  }
  await writeAiServerSetting(customServers.filter((server) => server.id !== serverId));
  return { ok: true };
}

export async function saveAiModuleRoutes(input: Record<AiModuleKey, string[]>): Promise<AiServerMutationResult> {
  const setting = await prisma.aiServerSetting.findUnique({ where: { id: aiServerSettingsId } });
  const customServers = getCustomServers(setting);
  const enabledServerIds = new Set([
    builtInAiServerProfileId,
    ...customServers.filter((server) => server.enabled).map((server) => server.id)
  ]);
  const normalizedRoutes = Object.fromEntries(aiModuleDefinitions.map((module) => [
    module.key,
    Array.from(new Set(input[module.key].map((serverId) => serverId.trim()).filter(Boolean)))
  ])) as Record<AiModuleKey, string[]>;
  if (aiModuleDefinitions.some((module) => (
    normalizedRoutes[module.key].length === 0 ||
    normalizedRoutes[module.key].some((serverId) => !enabledServerIds.has(serverId))
  ))) {
    return { ok: false, error: "invalid-ai-module-routes" };
  }
  await writeAiServerSetting(customServers, normalizedRoutes);
  return { ok: true };
}
