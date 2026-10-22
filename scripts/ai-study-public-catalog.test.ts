import assert from "node:assert/strict";
import { groupCompletedOwnedAiStudyProjects, groupPublicAiStudyProjects, originalAiStudyProjectTitle } from "../src/lib/ai-study-public-catalog";

const projects = [
  { id: "part-4", canonicalProjectId: "part-1", partIndex: 4, partCount: 4, title: "[Part.4/4] 薛兆丰经济学" },
  { id: "legacy-2", canonicalProjectId: null, partIndex: 2, partCount: 2, title: "[Part.2/2] 旧资料" },
  { id: "part-3", canonicalProjectId: "part-1", partIndex: 3, partCount: 4, title: "[Part.3/4] 薛兆丰经济学" },
  { id: "part-2", canonicalProjectId: "part-1", partIndex: 2, partCount: 4, title: "[Part.2/4] 薛兆丰经济学" },
  { id: "part-1", canonicalProjectId: null, partIndex: 1, partCount: 4, title: "[Part.1/4] 薛兆丰经济学" },
  { id: "legacy-1", canonicalProjectId: null, partIndex: 1, partCount: 2, title: "[Part.1/2] 旧资料" }
];

const grouped = groupPublicAiStudyProjects(projects);
assert.equal(grouped.length, 3);
assert.equal(grouped[0].project.id, "part-1");
assert.equal(grouped[0].partCount, 4);
assert.equal(grouped[0].unified, true);
assert.equal(grouped[1].unified, false);
assert.equal(grouped[2].unified, false);
assert.equal(originalAiStudyProjectTitle(grouped[0].project.title), "薛兆丰经济学");
assert.equal(originalAiStudyProjectTitle("[Part.1/4] 薛兆丰经济学（原文第1–160页）"), "薛兆丰经济学");

const ownedParts = [
  { id: "book-1", canonicalProjectId: null, partIndex: 1, partCount: 3 },
  { id: "book-2", canonicalProjectId: "book-1", partIndex: 2, partCount: 3 },
  { id: "book-3", canonicalProjectId: "book-1", partIndex: 3, partCount: 3 },
  { id: "single", canonicalProjectId: null, partIndex: null, partCount: null }
];
const completedIds = new Set(["book-1", "book-2", "book-3"]);
const readyOwned = groupCompletedOwnedAiStudyProjects(ownedParts, completedIds);
assert.deepEqual(readyOwned.map(({ project }) => project.id), ["book-1", "single"]);
assert.equal(readyOwned[0].unified, true);
assert.equal(readyOwned[0].partCount, 3);
assert.equal(readyOwned[1].unified, false);

assert.deepEqual(groupCompletedOwnedAiStudyProjects(ownedParts, new Set(["book-1", "book-2"])).map(({ project }) => project.id),
  ["book-1", "book-2", "book-3", "single"]);
assert.deepEqual(groupCompletedOwnedAiStudyProjects(ownedParts.filter((part) => part.id !== "book-3"), completedIds).map(({ project }) => project.id),
  ["book-1", "book-2", "single"]);
console.log("public AI project catalog grouping passed");
