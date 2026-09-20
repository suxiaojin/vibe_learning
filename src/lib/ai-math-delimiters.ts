// remark-math handles dollar delimiters. Normalize the other two common LaTeX
// delimiters BEFORE Markdown unescapes them, leaving code and existing math alone.
export function normalizeAiMathDelimiters(source: string) {
  let result = "";
  let cursor = 0;
  while (cursor < source.length) {
    if (cursor === 0 || source[cursor - 1] === "\n") {
      const fence = source.slice(cursor).match(/^[ \t]*(\x60{3,}|~{3,})[^\n]*(?:\n|$)/);
      if (fence) {
        const endPattern = new RegExp("^[ \\t]*" + fence[1][0] + "{" + fence[1].length + ",}[ \\t]*\\r?$", "gm");
        endPattern.lastIndex = cursor + fence[0].length;
        const end = endPattern.exec(source);
        const next = end ? end.index + end[0].length : source.length;
        result += source.slice(cursor, next);
        cursor = next;
        continue;
      }
    }
    if (source[cursor] === "\x60") {
      const ticks = source.slice(cursor).match(/^\x60+/)![0];
      let end = cursor + ticks.length;
      while ((end = source.indexOf(ticks, end)) >= 0) {
        if (source[end - 1] !== "\x60" && source[end + ticks.length] !== "\x60") break;
        end += ticks.length;
      }
      const next = end >= 0 ? end + ticks.length : source.length;
      result += source.slice(cursor, next);
      cursor = next;
      continue;
    }
    // Do not normalize nested delimiters inside an existing dollar formula.
    if (source[cursor] === "$") {
      const dollars = source.slice(cursor).match(/^\$+/)![0];
      const end = source.indexOf(dollars, cursor + dollars.length);
      if (end >= 0) {
        result += source.slice(cursor, end + dollars.length);
        cursor = end + dollars.length;
        continue;
      }
    }
    if (source[cursor] === "\\") {
      const open = source.slice(cursor, cursor + 2);
      if (open === "\\[" || open === "\\(") {
        const close = open === "\\[" ? "\\]" : "\\)";
        const end = source.indexOf(close, cursor + 2);
        if (end >= 0) {
          const formula = source.slice(cursor + 2, end).trim();
          const lineStart = source.lastIndexOf("\n", cursor - 1) + 1;
          const before = source.slice(lineStart, cursor);
          const nextNewline = source.indexOf("\n", end + 2);
          const after = source.slice(end + 2, nextNewline < 0 ? source.length : nextNewline);
          if (open === "\\[" && !before.trim() && !after.trim()) {
            result += "$$\n" + formula + "\n" + before + "$$";
          } else {
            result += "$" + formula.replace(/\r?\n/g, " ") + "$";
          }
          cursor = end + 2;
          continue;
        }
        // Incomplete streaming delimiter: retain the literal backslash.
        result += "\\" + open;
        cursor += 2;
        continue;
      }
      result += source.slice(cursor, cursor + 2);
      cursor += 2;
      continue;
    }
    result += source[cursor++];
  }
  return result;
}
