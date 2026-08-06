import Link from "next/link";
import { ArrowLeft, FileText, ShieldCheck } from "lucide-react";
import { PdfFullscreenViewer } from "@/components/ai-study/pdf-fullscreen-viewer";

export type OfficialStudyMaterialViewerData = {
  id: string;
  title: string;
  description: string | null;
  fileType: "pdf" | "word";
  previewText: string | null;
  previewTruncated: boolean;
  course: { id: string; name: string } | null;
  major: { id: string; name: string } | null;
  publicSubject: { id: string; name: string } | null;
  publishedAt: Date | string | null;
};

export function OfficialStudyMaterialViewer({
  material,
  backHref,
  backTitle,
  fileUrl
}: {
  material: OfficialStudyMaterialViewerData;
  backHref: string;
  backTitle: string;
  fileUrl: string;
}) {
  return (
    <div className="mx-auto w-full max-w-[1504px]">
      <div className="flex flex-wrap items-center gap-4">
        <Link className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 transition hover:text-teal" href={backHref}>
          <ArrowLeft size={17} />
          {backTitle}
        </Link>
      </div>

      <header className="mt-5 rounded-2xl border border-slate-100 bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.05)]">
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="badge bg-emerald-50 text-emerald-700"><ShieldCheck className="mr-1 inline size-3.5" />Vibe Learning 官方资料</span>
              <span className="badge bg-slate-100 text-slate-600">{material.fileType === "pdf" ? "PDF" : "Word"}</span>
              {getMaterialScopeName(material) ? <span className="badge bg-blue-50 text-blue-700">{getMaterialScopeName(material)}</span> : null}
            </div>
            <h1 className="mt-3 text-2xl font-black text-ink">{material.title}</h1>
            {material.description ? <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">{material.description}</p> : null}
          </div>
        </div>
      </header>

      <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-[#eef1f5] shadow-[0_12px_38px_rgba(15,23,42,0.08)]">
        {material.fileType === "pdf" ? (
          <PdfFullscreenViewer src={fileUrl} title={`${material.title} PDF 在线阅读`} />
        ) : (
          <div className="max-h-[calc(100dvh-250px)] min-h-[680px] overflow-auto px-4 py-8 sm:px-8">
            <article className="mx-auto min-h-[900px] max-w-[900px] rounded-sm bg-white px-8 py-10 shadow-[0_4px_24px_rgba(15,23,42,0.12)] sm:px-14">
              <div className="mb-7 flex items-start gap-3 rounded-xl bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-800">
                <FileText className="mt-0.5 size-5 shrink-0" />
                <span>Word 在线阅读为安全文本预览，不进行 AI 分析；复杂表格、图片或特殊排版请下载原文件查看。</span>
              </div>
              {material.previewText ? (
                <div className="whitespace-pre-wrap break-words text-[16px] leading-8 text-slate-800">{material.previewText}</div>
              ) : (
                <div className="grid min-h-[420px] place-items-center text-sm text-slate-500">这份 Word 暂无可显示的文本预览。</div>
              )}
              {material.previewTruncated ? (
                <div className="mt-8 rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">在线文本预览内容较长，已截断；请下载原文件查看完整内容。</div>
              ) : null}
            </article>
          </div>
        )}
      </section>
    </div>
  );
}

function getMaterialScopeName(material: OfficialStudyMaterialViewerData) {
  return material.major?.name || material.publicSubject?.name || material.course?.name || "";
}
