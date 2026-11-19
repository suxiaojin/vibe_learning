export const onlineMineruStageLabels = {
  preparing: "准备提交文件",
  uploading: "上传 PDF",
  waiting: "等待 MinerU 返回",
  downloading: "下载并解包结果",
  enriching_images: "补充解析图片",
  saving: "保存解析结果"
} as const;

export type OnlineMineruStage = keyof typeof onlineMineruStageLabels;
export type ReportOnlineMineruStage = (stage: OnlineMineruStage) => Promise<void>;

export type OnlineMineruTimeline = {
  attemptStartedAt: string | null;
  steps: { stage: OnlineMineruStage; startedAt: string }[];
};

export function readOnlineMineruTimeline(summary: unknown, attemptStartedAt: Date | null) {
  const timeline = asRecord(asRecord(summary)?.onlineMineruTimeline);
  if (timeline?.attemptStartedAt !== (attemptStartedAt?.toISOString() ?? null) || !Array.isArray(timeline?.steps)) return [];
  return timeline.steps.flatMap((value) => {
    const step = asRecord(value);
    const stage = step?.stage;
    const startedAt = step?.startedAt;
    if (typeof stage !== "string" || !Object.hasOwn(onlineMineruStageLabels, stage) ||
        typeof startedAt !== "string" || !Number.isFinite(Date.parse(startedAt))) return [];
    return [{ stage: stage as OnlineMineruStage, startedAt }];
  });
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
