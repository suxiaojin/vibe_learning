import type { ShareCopyContext } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type ShareCopyStyleDto = {
  id: string;
  label: string;
  phrases: Array<{
    id: string;
    content: string;
  }>;
};

export const shareCopyContextLabels: Record<ShareCopyContext, string> = {
  active_learning: "Active Learning",
  question_correct: "题目答对",
  question_wrong: "题目答错",
  quiz_failed: "闯关未过",
  quiz_passed: "闯关成功"
};

export async function listShareCopyStyles(context: ShareCopyContext): Promise<ShareCopyStyleDto[]> {
  const styles = await prisma.shareCopyStyle.findMany({
    where: {
      context,
      status: "published",
      phrases: {
        some: { status: "published" }
      }
    },
    include: {
      phrases: {
        where: { status: "published" },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          content: true
        }
      }
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
  });

  return styles.map((style) => ({
    id: style.id,
    label: style.label,
    phrases: style.phrases
  }));
}

export function isShareCopyContext(value: string): value is ShareCopyContext {
  return value in shareCopyContextLabels;
}
