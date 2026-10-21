import assert from "node:assert/strict";
import { groupAdminAiStudyProjects, listAdminAiStudyProjects } from "../src/lib/admin-ai-study-projects";
import { prisma } from "../src/lib/prisma";

const createdAt = new Date("2026-10-21T00:00:00Z");
const projects = [
  { id: "part-2", title: "[Part.2/2] 同一本书", partGroupId: "part-1", partIndex: 2, partCount: 2, createdAt },
  { id: "other", title: "同一本书", partGroupId: null, partIndex: null, partCount: null, createdAt },
  { id: "part-1", title: "[Part.1/2] 同一本书（原文第1-100页）", partGroupId: "part-1", partIndex: 1, partCount: 2, createdAt }
];
const groups = groupAdminAiStudyProjects(projects);
assert.equal(groups.length, 2, "同名但没有同一 partGroupId 的项目不能合并");
const splitGroup = groups.find((group) => group.id === "part-1");
assert(splitGroup);
assert.equal(splitGroup.title, "同一本书");
assert.deepEqual(splitGroup.parts.map((part) => part.id), ["part-1", "part-2"]);

async function main() {
  try {
    const data = await listAdminAiStudyProjects();
    assert(data.stats.filteredCount >= data.groups.length);
    for (const group of data.groups.filter((item) => item.isPartGroup)) {
      assert.deepEqual(group.parts.map((part) => part.partIndex), [...group.parts.map((part) => part.partIndex)].sort((a, b) => (a ?? 0) - (b ?? 0)));
    }
    const splitSizes = data.groups.filter((group) => group.isPartGroup).map((group) => `${group.parts.length}/${group.expectedPartCount}`);
    console.log(`Admin AI study grouping passed; ${data.groups.length} groups; split sizes: ${splitSizes.join(", ") || "none"}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
