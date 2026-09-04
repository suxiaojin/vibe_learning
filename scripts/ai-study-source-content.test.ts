import assert from "node:assert/strict";
import { buildMineruSemanticChunks } from "../src/lib/ai-study-generation";
import { hydrateAiStudySourceChunks } from "../src/lib/ai-study-source-content";

const now = new Date("2026-09-03T00:00:00.000Z");
const chunks: Parameters<typeof hydrateAiStudySourceChunks>[0] = [
  {
    id: "chunk-text",
    projectId: "project",
    sourceId: "source",
    pageStart: 1,
    pageEnd: 2,
    chunkIndex: 0,
    chunkType: "text",
    sourceBlockIds: ["block-1", "block-2"],
    tokenCount: 2,
    contentHash: "hash-text",
    createdAt: now
  },
  {
    id: "chunk-formula",
    projectId: "project",
    sourceId: "source",
    pageStart: 3,
    pageEnd: 3,
    chunkIndex: 1,
    chunkType: "equation",
    sourceBlockIds: ["block-3"],
    tokenCount: 4,
    contentHash: "hash-formula",
    createdAt: now
  }
];

const blocks: Parameters<typeof hydrateAiStudySourceChunks>[1] = [
  {
    id: "block-1",
    blockType: "text",
    textContent: "重复内容",
    latexContent: null,
    assetKey: null,
    bbox: [0, 0, 10, 10]
  },
  {
    id: "block-2",
    blockType: "text",
    textContent: "重复内容",
    latexContent: null,
    assetKey: null,
    bbox: [0, 10, 10, 20]
  },
  {
    id: "block-3",
    blockType: "equation",
    textContent: null,
    latexContent: "x^2+y^2=z^2",
    assetKey: null,
    bbox: [0, 20, 10, 30]
  }
];

const hydrated = hydrateAiStudySourceChunks(chunks, blocks);
assert.equal(hydrated[0].content, "重复内容");
assert.equal(hydrated[0].pageNumber, null);
assert.equal(hydrated[0].bbox, null);
assert.equal(hydrated[1].content, "$$x^2+y^2=z^2$$");
assert.equal(hydrated[1].pageNumber, 3);
assert.deepEqual(hydrated[1].bbox, [0, 20, 10, 30]);

const sourceBlocks: Parameters<typeof buildMineruSemanticChunks>[0] = [
  buildSourceBlock("block-text-1", 0, "text", "相同正文"),
  buildSourceBlock("block-text-2", 1, "text", "相同正文"),
  buildSourceBlock("block-code-1", 2, "code", "const one = 1;"),
  buildSourceBlock("block-code-2", 3, "code", "const two = 2;"),
  buildSourceBlock("block-list-1", 4, "list", "- 第一项"),
  buildSourceBlock("block-list-2", 5, "list", "- 第二项")
];
const semanticChunks = buildMineruSemanticChunks(sourceBlocks);
assert.deepEqual(semanticChunks.map((chunk) => chunk.chunkType), ["text", "code", "list"]);
assert.equal(semanticChunks[0].content, "相同正文");
assert.deepEqual(semanticChunks[0].sourceBlockIds, ["block-text-1", "block-text-2"]);
assert.match(semanticChunks[1].content, /const one = 1;[\s\S]*const two = 2;/);
assert.match(semanticChunks[2].content, /第一项[\s\S]*第二项/);

console.log("ai-study-source-content tests passed");

function buildSourceBlock(id: string, blockIndex: number, blockType: string, textContent: string) {
  return {
    id,
    projectId: "project",
    sourceId: "source",
    pageNumber: 1,
    blockIndex,
    blockType,
    readingOrder: blockIndex,
    bbox: undefined,
    textContent,
    latexContent: null,
    assetKey: null,
    headingPath: ["测试章节"],
    confidence: null,
    parserBlockId: null
  };
}
