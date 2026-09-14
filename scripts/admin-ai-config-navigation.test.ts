import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function main() {
  const files = {
    actions: await readFile("src/app/admin/actions.ts", "utf8"),
    aiModuleServerSelector: await readFile("src/components/admin-ai-module-server-selector.tsx", "utf8"),
    aiServerPanel: await readFile("src/components/admin-ai-server-settings.tsx", "utf8"),
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
  assert.match(files.aiServerPanel, /AdminAiModuleServerSelector/);
  assert.match(files.aiServerPanel, /勾选先后决定轮询顺序/);
  assert.match(files.aiServerPanel, /多选后没有固定首选：第 1 台是轮询起点，后续新请求依次轮换/);
  assert.match(files.aiServerPanel, /课程闯关、专项练习和问问搭子调用失败且尚未输出内容时，会继续尝试其余服务器/);
  assert.match(files.aiModuleServerSelector, /^"use client";/);
  assert.match(files.aiModuleServerSelector, /type="checkbox"/);
  assert.match(files.aiModuleServerSelector, /current\.includes\(serverId\) \? current : \[\.\.\.current, serverId\]/);
  assert.match(files.aiModuleServerSelector, /selectedServerIds\.map[\s\S]*name=\{`route_\$\{moduleKey\}`\}[\s\S]*type="hidden"/);
  assert.match(files.aiModuleServerSelector, /待保存轮询顺序/);
  assert.match(files.aiModuleServerSelector, /勾选先后即轮询顺序；取消后重新勾选，会把该服务器移到最后/);
  assert.doesNotMatch(files.systemSettingsPage, /AdminAiServerSettingsPanel|getAdminAiServerSettings|ai-server-saved/);

  const aiServerAction = files.actions.slice(
    files.actions.indexOf("export async function saveAiServerProfileSettings"),
    files.actions.indexOf("export async function updateStudyBuddyHeroImageSettings")
  );
  assert.match(aiServerAction, /export async function deleteAiServerProfileSettings/);
  assert.match(aiServerAction, /export async function updateAiModuleRouteSettings/);
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
