import assert from "node:assert/strict";
import { chooseFairAiStudyTask } from "../src/lib/ai-study-task-fairness";

const task = (id: string, ownerId: string) => ({ id, project: { ownerId } });

const arrivals = [task("a1", "A"), task("a2", "A"), task("a3", "A"), task("b1", "B"), task("c1", "C"), task("d1", "D")];
const activeOwners: string[] = [];
const firstThree: string[] = [];
const lastClaims = new Map<string, number>();
for (let slot = 0; slot < 3; slot += 1) {
  const chosen = chooseFairAiStudyTask(arrivals.filter((item) => !firstThree.includes(item.id)), activeOwners, lastClaims)!;
  firstThree.push(chosen.id);
  activeOwners.push(chosen.project.ownerId);
  lastClaims.set(chosen.project.ownerId, slot + 1);
}
assert.deepEqual(firstThree, ["a1", "b1", "c1"]);
assert.equal(chooseFairAiStudyTask(arrivals.filter((item) => !firstThree.includes(item.id)), ["B", "C"], lastClaims)?.id, "d1");

// One user's split book must not claim the next slot ahead of a waiting user.
assert.equal(
  chooseFairAiStudyTask([task("a2", "A"), task("b1", "B"), task("c1", "C")], ["A", "A"], new Map())?.id,
  "b1"
);

// Fill otherwise idle capacity, and balance counts when all owners are active.
assert.equal(chooseFairAiStudyTask([task("a2", "A")], ["A"], new Map())?.id, "a2");
assert.equal(chooseFairAiStudyTask([task("a3", "A"), task("b2", "B")], ["A", "A", "B"], new Map())?.id, "b2");
assert.equal(chooseFairAiStudyTask([task("a2", "A"), task("b2", "B")], ["A", "B"], new Map())?.id, "a2");
assert.equal(chooseFairAiStudyTask([task("a2", "A"), task("b2", "B")], [], new Map([["A", 10], ["B", 5]]))?.id, "b2");

// A task pinned to a busy model must not block eligible work behind it.
assert.equal(
  chooseFairAiStudyTask([task("b1", "B"), task("c1", "C"), task("a2", "A")], ["A"], new Map(), (item) => item.id !== "b1")?.id,
  "c1"
);
assert.equal(chooseFairAiStudyTask([task("b1", "B")], [], new Map(), () => false), null);

console.log("AI study task fairness checks passed");
