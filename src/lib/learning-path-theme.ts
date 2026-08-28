import type { CSSProperties } from "react";

export const learningPathThemes = [
  { key: "default", name: "默认绿色", primary: "#58CC02", strong: "#45A000" },
  { key: "sage", name: "鼠尾草绿", primary: "#62796B", strong: "#4B6053" },
  { key: "mist-blue", name: "雾霾蓝", primary: "#5F778A", strong: "#485E70" },
  { key: "dusty-rose", name: "灰豆沙", primary: "#936C73", strong: "#765159" },
  { key: "mist-pink", name: "雾粉", primary: "#9F607C", strong: "#804961" },
  { key: "clay-red", name: "陶红", primary: "#A55F5B", strong: "#854642" },
  { key: "smoky-purple", name: "烟紫灰", primary: "#7B7086", strong: "#60566B" },
  { key: "warm-clay", name: "暖陶棕", primary: "#916E5D", strong: "#745443" },
  { key: "olive-gray", name: "橄榄灰", primary: "#74785B", strong: "#585D43" }
] as const;

export type LearningPathThemeKey = typeof learningPathThemes[number]["key"];
export const defaultLearningPathThemeKey: LearningPathThemeKey = "default";

export function isLearningPathThemeKey(value: unknown): value is LearningPathThemeKey {
  return typeof value === "string" && learningPathThemes.some((theme) => theme.key === value);
}

export function getLearningPathTheme(value?: string | null) {
  return learningPathThemes.find((theme) => theme.key === value) || learningPathThemes[0];
}

export function getLearningPathThemeStyle(value?: string | null): CSSProperties & {
  "--challenge-primary": string;
  "--challenge-strong": string;
  "--challenge-ring": string;
  "--challenge-muted": string;
  "--challenge-icon-muted": string;
  "--challenge-accent": string;
} {
  const theme = getLearningPathTheme(value);
  // Opaque 10% tint keeps chapter cards consistent on every page background.
  const muted = "#" + [1, 3, 5].map((offset) => {
    const channel = parseInt(theme.primary.slice(offset, offset + 2), 16);
    return Math.round(255 * 0.9 + channel * 0.1).toString(16).padStart(2, "0");
  }).join("");
  return {
    "--challenge-primary": theme.primary,
    "--challenge-strong": theme.strong,
    "--challenge-ring": `${theme.primary}33`,
    "--challenge-muted": theme.key === "default" ? "#EFFBE7" : muted,
    "--challenge-icon-muted": `${theme.primary}26`,
    "--challenge-accent": theme.key === "default" ? "#1F9D8A" : theme.strong
  };
}
