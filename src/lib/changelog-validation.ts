export const agreementFields = [
  { key: "userAgreementContent", label: "用户协议内容" },
  { key: "privacyPolicyContent", label: "隐私政策内容" },
  { key: "platformAgreementContent", label: "平台使用协议内容" },
  { key: "faqContent", label: "常见问题内容" }
] as const;

export type AgreementKey = (typeof agreementFields)[number]["key"];

export function isAgreementKey(value: string): value is AgreementKey {
  return agreementFields.some((field) => field.key === value);
}

export function parseChangelog(form: FormData) {
  const title = String(form.get("title") || "").trim();
  const badgeText = String(form.get("badgeText") || "").trim();
  const summary = String(form.get("summary") || "").trim();
  const content = String(form.get("content") || "").trim();
  const date = String(form.get("releaseDate") || "").trim();
  const state = String(form.get("isPublished") || "");
  if (!title || title.length > 120) return { error: "请填写标题，最多 120 字。" } as const;
  if (badgeText.length > 20) return { error: "展示标签最多 20 字。" } as const;
  if (summary.length > 300) return { error: "摘要最多 300 字。" } as const;
  if (!content || content.length > 200000) return { error: "请填写正文，最多 200,000 字。" } as const;
  const releaseDate = new Date(`${date}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(releaseDate.getTime()) || releaseDate.toISOString().slice(0, 10) !== date) {
    return { error: "请填写有效的发布日期。" } as const;
  }
  if (state !== "true" && state !== "false") return { error: "请选择保存草稿或发布。" } as const;
  return { data: { title, badgeText, summary, content, releaseDate, isPublished: state === "true" } } as const;
}
