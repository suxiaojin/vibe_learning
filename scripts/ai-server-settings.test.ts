import assert from "node:assert/strict";
import {
  aiModuleDefinitions,
  decryptAiApiKey,
  encryptAiApiKey,
  getAiServerConfigForModule,
  getAiServerConfigsForModule,
  getAdminAiServerSettings,
  normalizeAiBaseUrl,
  saveAiModuleRoutes,
  type AiModuleKey
} from "../src/lib/ai-server-settings";
import { prisma } from "../src/lib/prisma";

process.env.AI_SERVER_CONFIG_SECRET = "ai-server-settings-test-secret-2026";

assert.equal(normalizeAiBaseUrl("https://api.deepseek.com/v1/"), "https://api.deepseek.com/v1");
assert.equal(normalizeAiBaseUrl("https://open.bigmodel.cn/api/paas/v4/chat/completions"), "https://open.bigmodel.cn/api/paas/v4");
assert.equal(normalizeAiBaseUrl(" http://10.138.12.88:30001/v1/// "), "http://10.138.12.88:30001/v1");
assert.throws(() => normalizeAiBaseUrl("ftp://example.com/v1"), /Invalid AI API base URL/);
assert.throws(() => normalizeAiBaseUrl("https://user:password@example.com/v1"), /Invalid AI API base URL/);
assert.throws(() => normalizeAiBaseUrl("https://example.com/v1?token=unsafe"), /Invalid AI API base URL/);

const originalApiKey = "sk-test-value-that-must-not-be-plain-text";
const encrypted = encryptAiApiKey(originalApiKey);
assert.notEqual(encrypted, originalApiKey);
assert.equal(encrypted.includes(originalApiKey), false);
assert.equal(decryptAiApiKey(encrypted), originalApiKey);
assert.equal(encryptAiApiKey(""), "");
assert.equal(decryptAiApiKey(""), "");
assert.throws(() => decryptAiApiKey(`${encrypted}broken`));

async function main() {
  const delegate = prisma.aiServerSetting as unknown as {
    findUnique: (args: unknown) => Promise<unknown>;
    upsert: (args: unknown) => Promise<unknown>;
  };
  const originalFindUnique = delegate.findUnique;
  const originalUpsert = delegate.upsert;
  const originalBaseUrl = process.env.QWEN_API_BASE_URL;
  const originalModel = process.env.QWEN_MODEL;
  let setting: Record<string, unknown> = {
    id: "default",
    mode: "built_in",
    customName: "",
    customBaseUrl: "",
    customModel: "",
    customApiKeyEncrypted: "",
    customServers: [
      {
        id: "server_a",
        name: "服务器 A",
        baseUrl: "https://a.example.com/v1",
        model: "model-a",
        apiKeyEncrypted: encrypted,
        enabled: true
      },
      {
        id: "server_b",
        name: "服务器 B",
        baseUrl: "https://b.example.com/v1",
        model: "model-b",
        apiKeyEncrypted: "",
        enabled: true
      }
    ],
    moduleRoutes: { ai_study_chat: ["server_a", "server_b"], course_ai_explanation: "server_a" }
  };
  const writes: unknown[] = [];

  try {
    delegate.findUnique = async () => setting;
    delegate.upsert = async (args) => {
      writes.push(args);
      return setting;
    };
    process.env.QWEN_API_BASE_URL = "http://10.138.12.88:30001/v1";
    process.env.QWEN_MODEL = "qwen-test";

    const candidateGroups = [
      await getAiServerConfigsForModule("ai_study_chat"),
      await getAiServerConfigsForModule("ai_study_chat")
    ];
    assert.deepEqual(candidateGroups.map((servers) => servers.map((server) => server.id)), [
      ["server_a", "server_b"],
      ["server_b", "server_a"]
    ]);

    const chatServers = [
      await getAiServerConfigForModule("ai_study_chat"),
      await getAiServerConfigForModule("ai_study_chat"),
      await getAiServerConfigForModule("ai_study_chat")
    ];
    assert.deepEqual(chatServers.map((server) => server.id), ["server_a", "server_b", "server_a"]);
    assert.equal(chatServers[0].apiKey, originalApiKey);
    assert.equal((await getAiServerConfigForModule("course_ai_explanation")).id, "server_a");
    assert.equal((await getAiServerConfigForModule("question_bank_ai_tagging")).id, "built_in");

    const adminSettings = await getAdminAiServerSettings();
    assert.equal(adminSettings.moduleRoutes.length, aiModuleDefinitions.length);
    assert.deepEqual(
      adminSettings.moduleRoutes.find((route) => route.key === "ai_study_chat")?.serverIds,
      ["server_a", "server_b"]
    );

    const invalidRoutes = Object.fromEntries(
      aiModuleDefinitions.map((module) => [module.key, module.key === "ai_study_chat" ? [] : ["server_a"]])
    ) as Record<AiModuleKey, string[]>;
    assert.deepEqual(await saveAiModuleRoutes(invalidRoutes), { ok: false, error: "invalid-ai-module-routes" });
    assert.equal(writes.length, 0);

    const validRoutes = Object.fromEntries(
      aiModuleDefinitions.map((module) => [module.key, ["server_a", "server_b", "server_a"]])
    ) as Record<AiModuleKey, string[]>;
    assert.deepEqual(await saveAiModuleRoutes(validRoutes), { ok: true });
    assert.deepEqual(
      (writes[0] as { update: { moduleRoutes: Record<AiModuleKey, string[]> } }).update.moduleRoutes.ai_study_chat,
      ["server_a", "server_b"]
    );

    const reversedRoutes = Object.fromEntries(
      aiModuleDefinitions.map((module) => [module.key, ["server_b", "server_a"]])
    ) as Record<AiModuleKey, string[]>;
    assert.deepEqual(await saveAiModuleRoutes(reversedRoutes), { ok: true });
    assert.deepEqual(
      (writes[1] as { update: { moduleRoutes: Record<AiModuleKey, string[]> } }).update.moduleRoutes.ai_study_chat,
      ["server_b", "server_a"]
    );

    setting = {
      ...setting,
      mode: "custom",
      customName: "原自定义服务器",
      customBaseUrl: "https://legacy.example.com/v1",
      customModel: "legacy-model",
      customApiKeyEncrypted: encrypted,
      customServers: [],
      moduleRoutes: {}
    };
    assert.equal((await getAiServerConfigForModule("question_bank_ai_tagging")).id, "legacy_custom");

    setting = {
      ...setting,
      mode: "built_in",
      customServers: [{
        id: "server_a",
        name: "服务器 A",
        baseUrl: "https://a.example.com/v1",
        model: "model-a",
        apiKeyEncrypted: encrypted,
        enabled: false
      }],
      moduleRoutes: { ai_study_chat: "server_a" }
    };
    await assert.rejects(getAiServerConfigForModule("ai_study_chat"), /unavailable/);
  } finally {
    delegate.findUnique = originalFindUnique;
    delegate.upsert = originalUpsert;
    if (originalBaseUrl === undefined) delete process.env.QWEN_API_BASE_URL;
    else process.env.QWEN_API_BASE_URL = originalBaseUrl;
    if (originalModel === undefined) delete process.env.QWEN_MODEL;
    else process.env.QWEN_MODEL = originalModel;
    await prisma.$disconnect();
  }
}

main()
  .then(() => console.log("ai-server-settings tests passed"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
