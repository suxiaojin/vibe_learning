import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function main() {
  const files = {
    actions: await readFile("src/app/admin/actions.ts", "utf8"),
    aiServerPage: await readFile("src/app/admin/prompt-settings/ai-server/page.tsx", "utf8"),
    adminModules: await readFile("src/lib/admin-modules.ts", "utf8"),
    challengePromptPage: await readFile("src/app/admin/prompt-settings/page.tsx", "utf8"),
    studyBuddyPromptPage: await readFile("src/app/admin/prompt-settings/study-buddy/page.tsx", "utf8"),
    systemSettingsPage: await readFile("src/app/admin/settings/page.tsx", "utf8")
  };

  assert.match(files.adminModules, /key: "prompt-settings", label: "AI配置"/);
  assert.match(files.adminModules, /where: \{ key: "prompt-settings" \}[\s\S]*data: \{ label: "AI配置", href: "\/admin\/prompt-settings" \}/);

  for (const page of [files.challengePromptPage, files.studyBuddyPromptPage, files.aiServerPage]) {
    assert.match(page, />AI配置</);
    assert.match(page, /href="\/admin\/prompt-settings\/ai-server"/);
    assert.match(page, />\s*AI服务器配置\s*</);
  }

  assert.match(files.aiServerPage, /AdminAiServerSettingsPanel/);
  assert.match(files.aiServerPage, /getAdminAiServerSettings/);
  assert.doesNotMatch(files.systemSettingsPage, /AdminAiServerSettingsPanel|getAdminAiServerSettings|ai-server-saved/);

  const aiServerAction = files.actions.slice(
    files.actions.indexOf("export async function updateAiServerSettings"),
    files.actions.indexOf("export async function updateStudyBuddyHeroImageSettings")
  );
  assert.match(aiServerAction, /aiServerConfigurationSettingsPath/);
  assert.match(aiServerAction, /revalidatePath\("\/admin\/prompt-settings\/ai-server"\)/);
  assert.doesNotMatch(aiServerAction, /adminConfigurationSettingsPath/);
}

main()
  .then(() => console.log("admin AI config navigation tests passed"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
