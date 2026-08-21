import Link from "next/link";

export function DiamondInsufficientMessage({ className = "" }: { className?: string }) {
  return (
    <span className={`font-normal text-slate-500 ${className}`} role="alert">
      {"钻石不足，"}<Link
        aria-label="前往我的钻石查看客服二维码"
        className="font-normal italic text-slate-500 underline decoration-slate-400 underline-offset-2 transition-colors hover:text-teal focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/20"
        href="/me?tab=diamonds"
      >
        客服
      </Link>{"充值后再试！"}
    </span>
  );
}
