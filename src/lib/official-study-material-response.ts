import { downloadAiStudyObject } from "@/lib/ai-study-storage";
import { OfficialStudyMaterialError } from "@/lib/official-study-materials";

type MaterialFile = {
  fileType: "pdf" | "word";
  originalFileName: string;
  mimeType: string;
  storageKey: string | null;
};

export async function createOfficialStudyMaterialFileResponse(
  material: MaterialFile,
  options: { download: boolean; admin: boolean }
) {
  if (!material.storageKey) {
    throw new OfficialStudyMaterialError("资料文件尚未准备完成。", 409, "OFFICIAL_MATERIAL_FILE_NOT_READY");
  }
  if (!options.download && !options.admin && material.fileType !== "pdf") {
    throw new OfficialStudyMaterialError("Word 资料请在阅读页查看文本预览。", 400, "OFFICIAL_MATERIAL_WORD_INLINE_UNAVAILABLE");
  }

  const object = await downloadAiStudyObject(material.storageKey);
  const disposition = options.download ? "attachment" : "inline";
  const encodedFileName = encodeURIComponent(material.originalFileName).replace(/['()]/g, escapeDispositionChar);
  return new Response(new Uint8Array(object.body), {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodedFileName}`,
      "Content-Length": String(object.body.length),
      "Content-Type": material.mimeType || object.contentType || "application/octet-stream",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function escapeDispositionChar(value: string) {
  return `%${value.charCodeAt(0).toString(16).toUpperCase()}`;
}
