export type SocialFollowRecommendationRule = {
  targetUserId: string;
  province: string | null;
  studySystem: string | null;
  majorId: string | null;
};

export function parseSocialFollowRecommendationRules(value: unknown): SocialFollowRecommendationRule[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const rule = entry as Record<string, unknown>;
    if (typeof rule.targetUserId !== "string" || !rule.targetUserId.trim()) return [];
    const optionalString = (candidate: unknown) =>
      typeof candidate === "string" && candidate.trim() ? candidate.trim() : null;
    return [{
      targetUserId: rule.targetUserId.trim(),
      province: optionalString(rule.province),
      studySystem: optionalString(rule.studySystem),
      majorId: optionalString(rule.majorId)
    }];
  });
}
