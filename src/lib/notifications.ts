export const notificationImageMaxBytes = 2 * 1024 * 1024;
export const notificationHtmlMaxChars = 6_000_000;

const maxEmbeddedImageDataUrlLength = 3_000_000;
const allowedTags = new Set([
  "a",
  "b",
  "blockquote",
  "br",
  "code",
  "div",
  "em",
  "font",
  "h2",
  "h3",
  "i",
  "img",
  "li",
  "ol",
  "p",
  "pre",
  "span",
  "strong",
  "u",
  "ul"
]);
const styleTags = new Set(["blockquote", "div", "h2", "h3", "li", "p", "span"]);
const entityMap: Record<string, string> = {
  amp: "&",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"'
};

export function sanitizeNotificationHtml(value: string) {
  const trimmed = value.replace(/\u0000/g, "").trim().slice(0, notificationHtmlMaxChars);
  const withoutBlockedContent = trimmed
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\s*(script|style|iframe|object|embed|link|meta|base|form|input|button|textarea|select)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|link|meta|base|form|input|button|textarea|select)[^>]*\/?\s*>/gi, "");

  const cleaned = withoutBlockedContent.replace(/<\/?([a-z][a-z0-9-]*)\b[^>]*>/gi, (match, rawTag) => {
    const tag = rawTag.toLowerCase();
    const closing = /^<\s*\//.test(match);

    if (!allowedTags.has(tag)) {
      return "";
    }
    if (closing) {
      return tag === "br" || tag === "img" ? "" : `</${tag}>`;
    }
    if (tag === "br") {
      return "<br>";
    }
    if (tag === "a") {
      const href = extractSafeHref(match);
      return href
        ? `<a href="${escapeAttribute(href)}" target="_blank" rel="noopener noreferrer">`
        : "<a>";
    }
    if (tag === "img") {
      const src = extractAttribute(match, "src");
      if (!isSafeImageSource(src)) {
        return "";
      }
      const alt = extractAttribute(match, "alt").trim().slice(0, 120) || "通知图片";
      return `<img src="${escapeAttribute(src)}" alt="${escapeAttribute(alt)}" loading="lazy">`;
    }
    if (tag === "font") {
      const attributes = [
        sanitizeFontFace(extractAttribute(match, "face")),
        sanitizeFontSize(extractAttribute(match, "size")),
        sanitizeColor(extractAttribute(match, "color"))
      ].filter(Boolean);
      return attributes.length > 0 ? `<font ${attributes.join(" ")}>` : "<font>";
    }
    if (styleTags.has(tag)) {
      const style = sanitizeStyle(extractAttribute(match, "style"));
      return style ? `<${tag} style="${escapeAttribute(style)}">` : `<${tag}>`;
    }
    return `<${tag}>`;
  });

  return cleaned || "<p></p>";
}

export function stripNotificationHtml(value: string) {
  return value
    .replace(/<img\b[^>]*>/gi, " [图片] ")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h2|h3|blockquote)>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&([a-z]+);/gi, (_, entity: string) => entityMap[entity.toLowerCase()] || " ")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

export function hasNotificationTemplateVariables(value: string) {
  return /{{\s*[a-zA-Z0-9_]+\s*}}/.test(value);
}

export function renderNotificationTemplateText(template: string, variables: Record<string, string>) {
  return replaceNotificationTemplateVariables(template, variables, false);
}

export function renderNotificationTemplateHtml(template: string, variables: Record<string, string>) {
  return replaceNotificationTemplateVariables(template, variables, true);
}

function replaceNotificationTemplateVariables(
  template: string,
  variables: Record<string, string>,
  escapeValues: boolean
) {
  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (placeholder, key: string) => {
    if (!(key in variables)) {
      return placeholder;
    }
    const value = variables[key] || "";
    return escapeValues ? escapeHtml(value) : value;
  });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function extractSafeHref(tag: string) {
  const href = extractAttribute(tag, "href").trim();
  if (!href) {
    return "";
  }
  return /^(https?:\/\/|mailto:|\/|#)/i.test(href) ? href : "";
}

function extractAttribute(tag: string, name: string) {
  const expression = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const match = tag.match(expression);
  return match?.[1] || match?.[2] || match?.[3] || "";
}

function isSafeImageSource(src: string) {
  if (/^(https?:\/\/|\/)/i.test(src)) {
    return src.length <= 2000;
  }
  return src.length <= maxEmbeddedImageDataUrlLength
    && /^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+/=\r\n]+$/i.test(src);
}

function sanitizeFontFace(value: string) {
  const face = value.trim().slice(0, 80);
  return face && /^[\p{L}\p{N}\s,"'-]+$/u.test(face) ? `face="${escapeAttribute(face)}"` : "";
}

function sanitizeFontSize(value: string) {
  const size = value.trim();
  return /^[1-7]$/.test(size) ? `size="${size}"` : "";
}

function sanitizeColor(value: string) {
  const color = value.trim().slice(0, 40);
  return isSafeColor(color) ? `color="${escapeAttribute(color)}"` : "";
}

function sanitizeStyle(value: string) {
  const safeDeclarations = value
    .split(";")
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .map((declaration) => {
      const separator = declaration.indexOf(":");
      if (separator < 1) {
        return "";
      }
      const property = declaration.slice(0, separator).trim().toLowerCase();
      const rawValue = declaration.slice(separator + 1).trim();
      if ((property === "color" || property === "background-color") && isSafeColor(rawValue)) {
        return `${property}:${rawValue}`;
      }
      if (property === "font-family" && /^[\p{L}\p{N}\s,"'-]+$/u.test(rawValue.slice(0, 80))) {
        return `${property}:${rawValue.slice(0, 80)}`;
      }
      if (property === "font-size" && /^(?:[1-6]?\d|72)(?:px|pt)$/.test(rawValue)) {
        return `${property}:${rawValue}`;
      }
      if (property === "text-align" && /^(left|center|right|justify)$/.test(rawValue)) {
        return `${property}:${rawValue}`;
      }
      return "";
    })
    .filter(Boolean);
  return safeDeclarations.join(";");
}

function isSafeColor(value: string) {
  const color = value.trim().slice(0, 40);
  return /^#[0-9a-f]{3,8}$/i.test(color)
    || /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(color)
    || /^[a-z]{3,20}$/i.test(color);
}

function escapeAttribute(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
