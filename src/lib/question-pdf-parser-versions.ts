import registry from "@/lib/question-pdf-parser-versions.json";

export type ParserVersionId = "v1" | "v2" | "working";
export function isParserVersion(value: string): value is ParserVersionId {
  return value === "v1" || value === "v2" || value === "working";
}
export function parserVersionUrl(version: ParserVersionId) {
  const value = version === "v1"
    ? process.env.QUESTION_PDF_PARSER_V1_URL || "http://172.18.255.14:8004"
    : version === "v2"
    ? process.env.QUESTION_PDF_PARSER_V2_URL || "http://172.18.255.14:8005"
    : process.env.QUESTION_PDF_PARSER_WORKING_URL || "http://172.18.255.14:8003";
  return value.replace(/\/+$/, "");
}
export async function parserVersionStatuses() {
  return Promise.all(registry.versions.filter((version) => isParserVersion(version.id)).map(async (version) => {
    try {
      const response = await fetch(`${parserVersionUrl(version.id as ParserVersionId)}/health`, { cache: "no-store", signal: AbortSignal.timeout(2000) });
      return { ...version, available: response.ok };
    } catch {
      return { ...version, available: false };
    }
  }));
}
