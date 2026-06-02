export const notificationRetentionDays = 10;

const allowedTags = new Set([
  "a",
  "b",
  "blockquote",
  "br",
  "code",
  "div",
  "em",
  "h2",
  "h3",
  "i",
  "li",
  "ol",
  "p",
  "pre",
  "span",
  "strong",
  "u",
  "ul"
]);

const entityMap: Record<string, string> = {
  amp: "&",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"'
};

export function getNotificationExpiresAt(now = new Date()) {
  return new Date(now.getTime() + notificationRetentionDays * 24 * 60 * 60 * 1000);
}

export function sanitizeNotificationHtml(value: string) {
  const trimmed = value.replace(/\u0000/g, "").trim().slice(0, 30000);
  const withoutBlockedContent = trimmed
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\s*(script|style|iframe|object|embed|link|meta|base)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|link|meta|base)[^>]*\/?\s*>/gi, "");

  const cleaned = withoutBlockedContent.replace(/<\/?([a-z][a-z0-9-]*)\b[^>]*>/gi, (match, rawTag) => {
    const tag = rawTag.toLowerCase();
    if (!allowedTags.has(tag)) {
      return "";
    }
    if (match.startsWith("</")) {
      return `</${tag}>`;
    }
    if (tag === "br") {
      return "<br>";
    }
    if (tag !== "a") {
      return `<${tag}>`;
    }

    const href = extractSafeHref(match);
    return href
      ? `<a href="${escapeAttribute(href)}" target="_blank" rel="noopener noreferrer">`
      : "<a>";
  });

  return cleaned || "<p></p>";
}

export function stripNotificationHtml(value: string) {
  return value
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h2|h3|blockquote)>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&([a-z]+);/gi, (_, entity: string) => entityMap[entity.toLowerCase()] || " ")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

function extractSafeHref(tag: string) {
  const match = tag.match(/\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
  const href = (match?.[1] || match?.[2] || match?.[3] || "").trim();
  if (!href) {
    return "";
  }
  return /^(https?:\/\/|mailto:|\/|#)/i.test(href) ? href : "";
}

function escapeAttribute(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
