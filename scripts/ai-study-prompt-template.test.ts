import assert from "node:assert/strict";
import {
  aiStudyPromptGroups,
  aiStudyPromptTemplateKeys,
  normalizeAiStudyPromptTemplates,
  validateAiStudyPromptTemplates
} from "../src/lib/ai-study-prompt-template";
import { readAiStudyPromptSeed } from "../src/lib/ai-study-prompts";

const validTemplates = normalizeAiStudyPromptTemplates(Object.fromEntries(
  aiStudyPromptGroups.flatMap((group) => group.templates).map((definition) => [
    definition.key,
    ["测试提示词", ...definition.requiredVariables.map((variable) => `{{${variable}}}`)].join("\n")
  ])
));

assert.deepEqual(aiStudyPromptTemplateKeys, ["chat.system", "chat.user"]);
assert.equal(validateAiStudyPromptTemplates(validTemplates), null);

assert.match(
  validateAiStudyPromptTemplates({ ...validTemplates, "chat.user": "学生问题" }) || "",
  /context/
);

assert.match(
  validateAiStudyPromptTemplates({ ...validTemplates, "chat.user": "{{context}}\n{{unknownValue}}" }) || "",
  /unknownValue/
);

assert.match(
  validateAiStudyPromptTemplates({ ...validTemplates, "chat.system": "" }) || "",
  /不能为空/
);
assert.deepEqual(
  normalizeAiStudyPromptTemplates({ ...validTemplates, "unused.field": "旧字段", "another.unused": "旧字段" }),
  validTemplates,
  "old published versions retain their records, but inactive fields are excluded from the new editor"
);

async function main() {
  const seed = await readAiStudyPromptSeed();
  assert.match(seed.sourceVersion, /^ai-study-v\d+/);
  assert.equal(validateAiStudyPromptTemplates(seed.templates), null);
  console.log("ai-study prompt template tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
