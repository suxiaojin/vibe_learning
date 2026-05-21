import { readFile } from "node:fs/promises";
import {
  assertImportQuestionPaperPayload,
  getQuestionPaperImportStats,
  importQuestionPaperPayload
} from "../src/lib/question-paper-import";
import { prisma } from "../src/lib/prisma";

async function main() {
  const jsonPath = process.argv[2];
  if (!jsonPath) {
    throw new Error("Usage: npx tsx scripts/import-question-paper-json.ts <payload.json>");
  }

  const payload = JSON.parse(await readFile(jsonPath, "utf-8")) as unknown;
  assertImportQuestionPaperPayload(payload);
  const result = await importQuestionPaperPayload(payload);

  console.log(
    JSON.stringify(
      {
        ...result,
        stats: getQuestionPaperImportStats(payload)
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
