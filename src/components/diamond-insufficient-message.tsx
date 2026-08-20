import Link from "next/link";

export function DiamondInsufficientMessage({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex flex-wrap items-center gap-y-1 ${className}`} role="alert">
      钻石不足，
      <Link
        aria-label="前往我的钻石查看客服二维码"
        className="mx-0.5 inline-flex min-h-8 items-center rounded-md border border-teal/20 bg-teal/5 px-2 font-bold text-teal underline-offset-2 transition hover:bg-teal/10 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/30"
        href="/me?tab=diamonds"
      >
        客服
      </Link>
      充值后再试！
    </span>
  );
}
