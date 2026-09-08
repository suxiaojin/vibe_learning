import assert from "node:assert/strict";
import {
  decryptAiApiKey,
  encryptAiApiKey,
  normalizeAiBaseUrl
} from "../src/lib/ai-server-settings";

process.env.AI_SERVER_CONFIG_SECRET = "ai-server-settings-test-secret-2026";

assert.equal(normalizeAiBaseUrl("https://api.deepseek.com/v1/"), "https://api.deepseek.com/v1");
assert.equal(normalizeAiBaseUrl("https://open.bigmodel.cn/api/paas/v4/chat/completions"), "https://open.bigmodel.cn/api/paas/v4");
assert.equal(normalizeAiBaseUrl(" http://10.138.12.88:30001/v1/// "), "http://10.138.12.88:30001/v1");
assert.throws(() => normalizeAiBaseUrl("ftp://example.com/v1"), /Invalid AI API base URL/);
assert.throws(() => normalizeAiBaseUrl("https://user:password@example.com/v1"), /Invalid AI API base URL/);
assert.throws(() => normalizeAiBaseUrl("https://example.com/v1?token=unsafe"), /Invalid AI API base URL/);

const original = "sk-test-value-that-must-not-be-plain-text";
const encrypted = encryptAiApiKey(original);
assert.notEqual(encrypted, original);
assert.equal(encrypted.includes(original), false);
assert.equal(decryptAiApiKey(encrypted), original);
assert.equal(encryptAiApiKey(""), "");
assert.equal(decryptAiApiKey(""), "");
assert.throws(() => decryptAiApiKey(`${encrypted}broken`));

console.log("ai-server-settings tests passed");
