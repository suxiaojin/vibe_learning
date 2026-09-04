import assert from "node:assert/strict";
import { assertCompleteFourLevelOutline, type AiStudyOutlineStructureNode } from "../src/lib/ai-study-outline-validation";

const completeOutline: AiStudyOutlineStructureNode[] = [
  { clientId: "root", parentClientId: null, title: "项目", depth: 0 },
  { clientId: "module", parentClientId: "root", title: "核心模块", depth: 1 },
  { clientId: "group", parentClientId: "module", title: "概念组", depth: 2 },
  { clientId: "point-a", parentClientId: "group", title: "具体知识点A", depth: 3 },
  { clientId: "point-b", parentClientId: "group", title: "具体知识点B", depth: 3 }
];

assert.doesNotThrow(() => assertCompleteFourLevelOutline(completeOutline));

assert.throws(
  () => assertCompleteFourLevelOutline(completeOutline.slice(0, 3)),
  /没有生成任何第 4 层知识点/
);

assert.throws(
  () => assertCompleteFourLevelOutline([
    ...completeOutline,
    { clientId: "early-module", parentClientId: "root", title: "提前结束模块", depth: 1 }
  ]),
  /第 2 层“提前结束模块”/
);

assert.throws(
  () => assertCompleteFourLevelOutline([
    ...completeOutline,
    { clientId: "early-group", parentClientId: "module", title: "提前结束概念组", depth: 2 }
  ]),
  /第 3 层“提前结束概念组”/
);

console.log("ai-study outline validation tests passed");
