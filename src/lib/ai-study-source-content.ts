import type { AiStudySourceBlock, AiStudySourceChunk, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type SourceBlockContent = Pick<
  AiStudySourceBlock,
  "id" | "blockType" | "textContent" | "latexContent" | "assetKey" | "bbox"
>;

export type AiStudySourceChunkWithContent = AiStudySourceChunk & {
  content: string;
  pageNumber: number | null;
  bbox: Prisma.JsonValue | null;
};

export function formatAiStudySourceBlockContent(block: Pick<SourceBlockContent, "blockType" | "textContent" | "latexContent" | "assetKey">) {
  if (block.blockType === "equation" && block.latexContent) {
    return `$$${block.latexContent}$$`;
  }
  if (block.blockType === "image") {
    return block.textContent ? `图片内容：${block.textContent}` : (block.assetKey ? `图片：${block.assetKey}` : "");
  }
  return block.textContent || "";
}

export function hydrateAiStudySourceChunks(
  chunks: AiStudySourceChunk[],
  blocks: SourceBlockContent[]
): AiStudySourceChunkWithContent[] {
  const blockById = new Map(blocks.map((block) => [block.id, block]));
  return chunks.map((chunk) => {
    const sourceBlockIds = readSourceBlockIds(chunk.sourceBlockIds);
    const sourceBlocks = sourceBlockIds
      .map((blockId) => blockById.get(blockId))
      .filter((block): block is SourceBlockContent => Boolean(block));
    const blockContents = Array.from(new Set(sourceBlocks.map(formatAiStudySourceBlockContent).filter(Boolean)));
    const content = normalizeSourceText(blockContents.join("\n\n"));
    if (!content) {
      throw new Error(`来源片段缺少可用的来源块：${chunk.id}`);
    }
    return {
      ...chunk,
      content,
      pageNumber: chunk.pageStart === chunk.pageEnd ? chunk.pageStart : null,
      bbox: sourceBlocks.length === 1 ? sourceBlocks[0].bbox : null
    };
  });
}

export async function loadAiStudySourceChunksWithContent(
  projectId: string,
  options: { ids?: string[]; take?: number } = {}
) {
  if (options.ids && options.ids.length === 0) {
    return [];
  }

  const chunks = await prisma.aiStudySourceChunk.findMany({
    where: {
      projectId,
      ...(options.ids ? { id: { in: options.ids } } : {})
    },
    orderBy: [{ sourceId: "asc" }, { chunkIndex: "asc" }],
    ...(options.take ? { take: options.take } : {})
  });
  if (chunks.length === 0) {
    return [];
  }

  const blockIds = Array.from(new Set(chunks.flatMap((chunk) => readSourceBlockIds(chunk.sourceBlockIds))));
  const blocks = await prisma.aiStudySourceBlock.findMany({
    where: {
      projectId,
      id: { in: blockIds }
    },
    select: {
      id: true,
      blockType: true,
      textContent: true,
      latexContent: true,
      assetKey: true,
      bbox: true
    }
  });
  return hydrateAiStudySourceChunks(chunks, blocks);
}

function readSourceBlockIds(value: Prisma.JsonValue | null): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function normalizeSourceText(text: string) {
  return text.replace(/\r\n/g, "\n")
    .split(/(```[\s\S]*?```)/g)
    .map((part) => part.startsWith("```")
      ? part.trim()
      : part
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{4,}/g, "\n\n")
        .replace(/[ \t]{2,}/g, " ")
        .trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}
