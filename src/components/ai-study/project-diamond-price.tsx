import { Check, Gem, Loader2 } from "lucide-react";

export function ProjectDiamondPrice({ diamondPrice, purchased = false, pending = false }: { diamondPrice: number; purchased?: boolean; pending?: boolean }) {
  if (pending || purchased) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[12px] font-semibold leading-none text-[#108a20]" role="status">
        {pending ? <Loader2 aria-hidden className="animate-spin" size={16} /> : <Check aria-hidden size={16} />}
        {pending ? "处理中" : "已购买"}
      </span>
    );
  }
  return (
    <span
      aria-label={diamondPrice > 0 ? `${diamondPrice} 钻石` : undefined}
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[12px] font-semibold leading-none ${diamondPrice > 0 ? "text-sky-500" : "text-[#108a20]"}`}
    >
      {diamondPrice > 0 ? <Gem aria-hidden className="text-sky-500" size={16} /> : null}
      {diamondPrice === 0 ? "免费" : diamondPrice}
    </span>
  );
}
