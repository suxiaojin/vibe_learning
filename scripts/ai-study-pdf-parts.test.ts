import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { inspectAndSplitPdf, planPdfParts } from "../src/lib/ai-study-pdf-parts";

async function main() {
  assert.deepEqual(planPdfParts(259, []), [{ index: 1, startPage: 1, endPage: 259 }]);
  assert.deepEqual(planPdfParts(600, [201, 401]).map(({ startPage, endPage }) => [startPage, endPage]), [
    [1, 200], [201, 400], [401, 600]
  ]);
  const fallback = planPdfParts(643, []);
  assert.equal(fallback.length, 4);
  assert.equal(fallback[0].startPage, 1);
  assert.equal(fallback.at(-1)?.endPage, 643);
  for (let index = 1; index < fallback.length; index += 1) {
    assert.equal(fallback[index].startPage, fallback[index - 1].endPage + 1);
  }

  const document = await PDFDocument.create();
  for (let index = 0; index < 270; index += 1) document.addPage([100, 100]);
  const split = await inspectAndSplitPdf(Buffer.from(await document.save()));
  assert.equal(split.parts.length, 2);
  const counts = await Promise.all(split.parts.map(async (part) => (await PDFDocument.load(part)).getPageCount()));
  assert.equal(counts.reduce((total, count) => total + count, 0), 270);
  console.log("AI study PDF parts: passed");
}

void main();
