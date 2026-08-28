"use client";

import Link from "next/link";
import { BookOpen, FileText, ShieldCheck } from "lucide-react";
import { ProjectDiamondPrice } from "@/components/ai-study/project-diamond-price";
import { ProjectPurchaseFeedback } from "@/components/ai-study/project-purchase-feedback";
import { useProjectPurchase } from "@/components/ai-study/use-project-purchase";

export type OfficialStudyMaterialCardItem = {
  kind: "official-material";
  id: string;
  title: string;
  description: string;
  fileType: "pdf" | "word";
  fileSizeBytes: number;
  diamondPrice: number;
  purchased?: boolean;
};

export function OfficialStudyMaterialCard({ material }: { material: OfficialStudyMaterialCardItem }) {
  const purchase = useProjectPurchase({ ...material, kind: "official" });
  return (
    <>
    <Link
      aria-busy={purchase.pending}
      className="group relative h-[206px] w-full max-w-[284px] overflow-hidden rounded-[24px] border border-[#dcefe0] bg-[linear-gradient(145deg,#ffffff_0%,#fbfffc_62%,#f0faef_100%)] p-5 shadow-[0_2px_30px_rgba(83,108,143,0.05)] outline-none transition hover:-translate-y-0.5 hover:border-[#bde3c3] hover:shadow-[0_10px_34px_rgba(24,130,48,0.10)] focus-visible:ring-4 focus-visible:ring-[#16a329]/20"
      href={`/study-buddy/materials/${material.id}`}
      prefetch={false}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        void purchase.open();
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 rounded-md bg-[#eaf8ec] px-2 py-1 text-[11px] font-black text-[#108a20]">
          <ShieldCheck size={13} />官方资料
        </span>
        <span className={`rounded-md px-2 py-1 text-[11px] font-black ${material.fileType === "pdf" ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-700"}`}>
          {material.fileType === "pdf" ? "PDF" : "Word"}
        </span>
      </div>

      <h3 className="mt-3 line-clamp-2 pr-10 text-[19px] font-semibold leading-[1.42] text-[#1d2430]">{material.title}</h3>
      <div className="mt-2 w-[190px]">
        <p className="line-clamp-2 text-[13px] font-medium leading-5 text-[#667085]">
          {material.description || "无需 AI 解析，打开即可阅读原始学习资料。"}
        </p>
      </div>

      <div className="absolute bottom-[46px] right-5 grid size-12 place-items-center rounded-xl border border-white bg-white/90 text-[#16a329] shadow-[0_7px_18px_rgba(16,24,40,0.10)] transition group-hover:scale-105">
        <BookOpen size={24} />
      </div>

      <div className="absolute bottom-5 left-5 right-5 flex h-7 items-center justify-between gap-3 text-[12px] text-[#98a2b3]">
        <ProjectDiamondPrice diamondPrice={purchase.diamondPrice} pending={purchase.pending} purchased={purchase.purchased} />
        <span className="inline-flex shrink-0 items-center gap-1">
          <FileText size={12} />
          {formatBytes(material.fileSizeBytes)}
        </span>
      </div>
    </Link>
    <ProjectPurchaseFeedback {...purchase.dialogProps} />
    </>
  );
}

function formatBytes(value: number) {
  if (value < 1024 * 1024) {
    return `${Math.max(1, Math.round(value / 1024))}KB`;
  }
  return `${(value / 1024 / 1024).toFixed(1)}MB`;
}
