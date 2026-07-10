import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type SurfaceElement = "article" | "aside" | "div" | "section";

export function PageHeader({
  actions,
  description,
  eyebrow,
  title
}: {
  actions?: ReactNode;
  description?: ReactNode;
  eyebrow?: string;
  title: string;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-5">
      <div className="min-w-0">
        {eyebrow ? <p className="mb-2 text-xs font-semibold uppercase text-teal">{eyebrow}</p> : null}
        <h1 className="text-3xl font-bold leading-tight text-ink md:text-[32px]">{title}</h1>
        {description ? <p className="mt-2 max-w-3xl text-[15px] font-medium leading-6 text-slate-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div> : null}
    </header>
  );
}

export function SurfaceCard({
  as = "section",
  children,
  className
}: {
  as?: SurfaceElement;
  children: ReactNode;
  className?: string;
}) {
  const Component = as;

  return <Component className={cn("surface-card p-5", className)}>{children}</Component>;
}

export function EmptyState({
  action,
  description,
  icon,
  title
}: {
  action?: ReactNode;
  description: string;
  icon?: ReactNode;
  title: string;
}) {
  return (
    <section className="empty-state">
      {icon ? <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-teal/10 text-teal">{icon}</div> : null}
      <h2 className="mt-4 text-xl font-semibold text-ink">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm font-medium leading-6 text-slate-500">{description}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </section>
  );
}

export function ProgressBar({
  indicatorClassName,
  label,
  value
}: {
  indicatorClassName?: string;
  label: string;
  value: number;
}) {
  const percent = Math.max(0, Math.min(100, value));

  return (
    <div aria-label={label} aria-valuemax={100} aria-valuemin={0} aria-valuenow={percent} className="progress-track" role="progressbar">
      <div className={cn("progress-fill", indicatorClassName)} style={{ width: `${percent}%` }} />
    </div>
  );
}

export function TabNav({
  activeKey,
  ariaLabel,
  items
}: {
  activeKey: string;
  ariaLabel: string;
  items: Array<{ href: string; key: string; label: string }>;
}) {
  return (
    <nav aria-label={ariaLabel}>
      <div className="tab-nav">
        {items.map((item) => {
          const active = activeKey === item.key;

          return (
            <a
              key={item.key}
              aria-current={active ? "page" : undefined}
              className={cn("tab-nav-link", active && "tab-nav-link-active")}
              href={item.href}
            >
              {item.label}
            </a>
          );
        })}
      </div>
    </nav>
  );
}
