export const studyBuddyHeroEffectOptions = [
  { value: "typewriter", label: "打字机" },
  { value: "fade-up", label: "淡入上浮" },
  { value: "character-pop", label: "逐字弹入" },
  { value: "gradient-shine", label: "渐变流光" },
  { value: "underline-swipe", label: "下划线划入" },
  { value: "none", label: "无效果" }
] as const;

export type StudyBuddyHeroEffect = (typeof studyBuddyHeroEffectOptions)[number]["value"];

export function isStudyBuddyHeroEffect(value: string): value is StudyBuddyHeroEffect {
  return studyBuddyHeroEffectOptions.some((option) => option.value === value);
}

export function normalizeStudyBuddyHeroEffect(value: string | null | undefined): StudyBuddyHeroEffect {
  return value && isStudyBuddyHeroEffect(value) ? value : "typewriter";
}
