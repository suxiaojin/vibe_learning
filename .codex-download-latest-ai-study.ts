import { writeFile } from "node:fs/promises";
import { prisma } from "./src/lib/prisma";
import { downloadAiStudyObject } from "./src/lib/ai-study-storage";

async function main() {
  const source = await prisma.aiStudySource.findFirstOrThrow({
    where: {
      project: {
        deletedAt: null,
        tasks: { some: { type: "generate_cards", status: "succeeded" } }
      }
    },
    orderBy: { createdAt: "desc" },
    select: { storageKey: true, sourceSha256: true, fileSizeBytes: true }
  });
  if (!source.storageKey) throw new Error("source storage key is missing");
  const object = await downloadAiStudyObject(source.storageKey);
  await writeFile("/tmp/codex-latest-ai-study.pdf", object.body);
  console.log(JSON.stringify({
    bytes: object.body.length,
    expectedBytes: source.fileSizeBytes,
    sourceSha256: source.sourceSha256
  }));
}

main()
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
