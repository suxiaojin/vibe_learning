const inlineMathTagPattern = /<(sub|sup)\b[^>]*>([\s\S]*?)<\/\1>/gi;
const imageAltPattern = /<img\b[^>]*\balt\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/gi;
const blockBreakPattern = /<\/?(?:address|article|aside|blockquote|div|h[1-6]|li|ol|p|pre|section|table|tr|ul)\b[^>]*>/gi;
const lineBreakPattern = /<br\b[^>]*\/?\s*>/gi;
const htmlTagPattern = /<[^>]*>/g;
const htmlEntityPattern = /&(?:amp|lt|gt|quot|apos|nbsp|#39|#x[0-9a-f]+|#\d+);/gi;

function decodeHtmlEntity(entity: string) {
  const normalized = entity.toLowerCase();
  const named: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&apos;": "'",
    "&#39;": "'",
    "&nbsp;": " "
  };
  if (normalized in named) {
    return named[normalized];
  }
  const hexadecimal = normalized.match(/^&#x([0-9a-f]+);$/i);
  const decimal = normalized.match(/^&#(\d+);$/);
  const codePoint = hexadecimal ? Number.parseInt(hexadecimal[1], 16) : decimal ? Number.parseInt(decimal[1], 10) : Number.NaN;
  try {
    return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
  } catch {
    return entity;
  }
}

function decodeHtmlEntities(value: string) {
  return value.replace(htmlEntityPattern, decodeHtmlEntity);
}

function stripInlineMarkup(value: string) {
  return decodeHtmlEntities(value.replace(htmlTagPattern, ""));
}

function richTextToText(value: string, preserveFormulaPosition: boolean) {
  const withFormulaPosition = String(value || "").replace(
    inlineMathTagPattern,
    (_, tag: string, content: string) => {
      const text = stripInlineMarkup(content);
      if (!preserveFormulaPosition) {
        return text;
      }
      return `${tag.toLowerCase() === "sub" ? "_" : "^"}(${text})`;
    }
  );
  return decodeHtmlEntities(
    withFormulaPosition
      .replace(imageAltPattern, (_, doubleQuoted: string | undefined, singleQuoted: string | undefined, bare: string | undefined) => doubleQuoted || singleQuoted || bare || "")
      .replace(lineBreakPattern, "\n")
      .replace(blockBreakPattern, "\n")
      .replace(htmlTagPattern, "")
  )
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function richTextToPlainText(value: string) {
  return richTextToText(value, false);
}

export function richTextToAiText(value: string) {
  return richTextToText(value, true);
}

export function richTextValueToAiText(value: unknown): unknown {
  if (typeof value === "string") {
    return richTextToAiText(value);
  }
  if (Array.isArray(value)) {
    return value.map(richTextValueToAiText);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, richTextValueToAiText(item)])
    );
  }
  return value;
}

export function normalizeRichTextAnswer(value: unknown) {
  return richTextToPlainText(String(value ?? "")).normalize("NFKC").trim();
}
