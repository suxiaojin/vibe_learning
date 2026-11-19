import { decryptAiApiKey, encryptAiApiKey } from "@/lib/ai-server-settings";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

const settingId = "study_buddy_mineru";
export type StudyMineruProvider = "private" | "online";
export const maxStudyMineruConcurrency = 50;
const maxStudyMineruTimeoutSeconds = 7200;
const maxStudyMineruPollSeconds = 60;
const minStudyMineruPollSeconds = { private: 1, online: 3 } as const;

type StudyMineruLimits = Record<StudyMineruProvider, {
  concurrency: number;
  timeoutSeconds: number;
  pollSeconds: number;
}>;

// Match the ai_server_settings_mode_check constraint on this table.
const modeByProvider = { private: "built_in", online: "custom" } as const;

function readSetting(db: Pick<Prisma.TransactionClient, "aiServerSetting"> = prisma) {
  return db.aiServerSetting.findUnique({
    where: { id: settingId },
    select: { mode: true, customApiKeyEncrypted: true, moduleRoutes: true }
  });
}

function boundedInteger(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

export function isStudyMineruConcurrency(value: unknown): value is number {
  return boundedInteger(value, 1, maxStudyMineruConcurrency);
}

function readStoredSettings(value: Prisma.JsonValue | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function readOnlineImageSupplementEnabled(value: Prisma.JsonValue | undefined) {
  return readStoredSettings(value).onlineImageSupplementEnabled === true;
}

function readLimits(value: Prisma.JsonValue | undefined): StudyMineruLimits {
  const stored = readStoredSettings(value);
  const envTimeout = Math.ceil(Number(process.env.AI_STUDY_MINERU_TIMEOUT_MS) / 1000);
  const envPoll = Math.ceil(Number(process.env.AI_STUDY_MINERU_POLL_INTERVAL_MS) / 1000);
  const envOnlineConcurrency = Number(process.env.AI_STUDY_MINERU_ONLINE_CONCURRENCY);
  function forProvider(provider: StudyMineruProvider): StudyMineruLimits[StudyMineruProvider] {
    const concurrency = stored[`${provider}Concurrency`];
    const timeout = stored[`${provider}TimeoutSeconds`];
    const poll = stored[`${provider}PollSeconds`];
    const minPoll = minStudyMineruPollSeconds[provider];
    const defaultConcurrency = provider === "private" ? 3
      : boundedInteger(envOnlineConcurrency, 1, maxStudyMineruConcurrency) ? envOnlineConcurrency : 12;
    const defaultPoll = boundedInteger(envPoll, 1, maxStudyMineruPollSeconds) ? Math.max(minPoll, envPoll) : 3;
    const pollSeconds = boundedInteger(poll, minPoll, maxStudyMineruPollSeconds) ? poll : defaultPoll;
    const defaultTimeout = boundedInteger(envTimeout, 1, maxStudyMineruTimeoutSeconds) ? envTimeout : 1800;
    return {
      concurrency: boundedInteger(concurrency, 1, maxStudyMineruConcurrency) ? concurrency : defaultConcurrency,
      timeoutSeconds: boundedInteger(timeout, pollSeconds, maxStudyMineruTimeoutSeconds)
        ? timeout
        : Math.max(defaultTimeout, pollSeconds),
      pollSeconds
    };
  }
  return { private: forProvider("private"), online: forProvider("online") };
}

export async function getAdminStudyMineruSettings() {
  const setting = await readSetting();
  const limits = readLimits(setting?.moduleRoutes);
  return {
    provider: setting?.mode === modeByProvider.online ? "online" as const : "private" as const,
    apiKeyConfigured: Boolean(setting?.customApiKeyEncrypted),
    onlineImageSupplementEnabled: readOnlineImageSupplementEnabled(setting?.moduleRoutes),
    concurrency: { private: limits.private.concurrency, online: limits.online.concurrency }
  };
}

export async function readStudyMineruSelection(db: Pick<Prisma.TransactionClient, "aiServerSetting"> = prisma) {
  const setting = await readSetting(db);
  const provider = setting?.mode === modeByProvider.online ? "online" : "private";
  const { concurrency, timeoutSeconds, pollSeconds } = readLimits(setting?.moduleRoutes)[provider];
  const options = { capacity: concurrency, timeoutMs: timeoutSeconds * 1000, pollIntervalMs: pollSeconds * 1000 };
  if (provider === "private") return { provider, ...options } as const;
  return {
    provider,
    ...options,
    encryptedToken: setting?.customApiKeyEncrypted ?? "",
    onlineImageSupplementEnabled: readOnlineImageSupplementEnabled(setting?.moduleRoutes)
  } as const;
}

export type StudyMineruSelection = Awaited<ReturnType<typeof readStudyMineruSelection>>;

export function getStudyMineruToken(selection: Extract<StudyMineruSelection, { provider: "online" }>) {
  const token = decryptAiApiKey(selection.encryptedToken);
  if (!token) throw new Error("请在管理后台配置 MinerU 在线 API Key。");
  return token;
}

export async function saveStudyMineruSettings(
  provider: StudyMineruProvider,
  token: string,
  concurrency: Record<StudyMineruProvider, number>,
  onlineImageSupplementEnabled: boolean
) {
  const setting = await readSetting();
  const encrypted = token ? encryptAiApiKey(token) : setting?.customApiKeyEncrypted ?? "";
  if (provider === "online" && !encrypted) return false;
  const mode = modeByProvider[provider];
  // The dedicated MinerU row uses this JSON field for its own settings.
  const moduleRoutes = {
    ...readStoredSettings(setting?.moduleRoutes),
    privateConcurrency: concurrency.private,
    onlineConcurrency: concurrency.online,
    onlineImageSupplementEnabled
  } as Prisma.InputJsonObject;
  await prisma.aiServerSetting.upsert({
    where: { id: settingId },
    update: { mode, moduleRoutes, ...(token ? { customApiKeyEncrypted: encrypted } : {}) },
    create: { id: settingId, mode, moduleRoutes, customApiKeyEncrypted: encrypted }
  });
  return true;
}
