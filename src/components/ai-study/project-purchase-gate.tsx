"use client";

import Link from "next/link";
import { ArrowLeft, BookOpen, Loader2, ShoppingCart } from "lucide-react";
import { ProjectDiamondPrice } from "@/components/ai-study/project-diamond-price";
import { ProjectPurchaseFeedback } from "@/components/ai-study/project-purchase-feedback";
import { useProjectPurchase } from "@/components/ai-study/use-project-purchase";
import type { StudyProjectOffer } from "@/lib/study-project-access";

export function ProjectPurchaseGate({ offer }: { offer: StudyProjectOffer }) {
  const purchase = useProjectPurchase(offer);
  return (
    <div className="mx-auto w-full max-w-3xl py-8">
      <Link className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-teal" href="/study-buddy">
        <ArrowLeft size={16} />返回学习搭子
      </Link>
      <div className="mt-12 border-b border-slate-200 pb-8">
        <BookOpen className="text-teal" size={32} />
        <h1 className="mt-5 break-words text-2xl font-bold">{offer.title}</h1>
        <div className="mt-4"><ProjectDiamondPrice diamondPrice={purchase.diamondPrice} purchased={purchase.purchased} /></div>
      </div>
      <button className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-teal px-5 text-sm font-bold text-white disabled:opacity-60" disabled={purchase.pending} onClick={() => void purchase.open()} type="button">
        {purchase.pending ? <Loader2 className="animate-spin" size={18} /> : <ShoppingCart size={18} />}
        {purchase.pending ? "处理中" : purchase.purchased || purchase.diamondPrice === 0 ? "打开项目" : "购买并打开"}
      </button>
      <ProjectPurchaseFeedback {...purchase.dialogProps} />
    </div>
  );
}
