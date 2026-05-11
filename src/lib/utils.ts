export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function formatSeconds(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes} 分钟`;
  }
  return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟`;
}
