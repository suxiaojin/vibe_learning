"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { loadChangelogs, readChangelog } from "@/app/help/actions";
import { MarkdownContent } from "@/components/agreement-content-page";

type Summary = { id: string; title: string; badgeText: string; summary: string; releaseDate: string | null };
type Detail = { title: string; content: string; releaseDate: string | null };

export function HelpChangelog({ initial }: { initial: { entries: Summary[]; hasMore: boolean } }) {
  const [entries, setEntries] = useState(initial.entries);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [offset, setOffset] = useState(initial.entries.length);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const heading = useRef<HTMLHeadingElement>(null);
  const scrollPosition = useRef(0);
  const selected = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (detail) {
      heading.current?.focus({ preventScroll: true });
      heading.current?.scrollIntoView({ block: "start" });
    }
  }, [detail]);

  function open(entry: Summary, button: HTMLButtonElement) {
    if (pending) return;
    setError("");
    scrollPosition.current = window.scrollY;
    selected.current = button;
    startTransition(async () => {
      try {
        const result = await readChangelog(entry.id);
        if (!result) { setError("这条更新日志已撤下，请查看其它更新。"); return; }
        setDetail(result);
      } catch { setError("加载失败，请稍后重试。"); }
    });
  }

  return <div aria-busy={pending}>
    {error ? <p role="alert" className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
    {pending ? <p role="status" className="mb-3 text-sm text-slate-500">正在加载…</p> : null}
    {/* Keep the list mounted so returning restores the loaded entries and keyboard focus. */}
    <div hidden={!!detail}>
      {!entries.length ? <p className="py-12 text-center text-sm text-slate-500">暂无更新日志</p> : <ol>
        {entries.map((entry) => <li key={entry.id} className="relative grid gap-2 border-l border-slate-200 pb-8 pl-5 sm:grid-cols-[100px_minmax(0,1fr)] sm:gap-6 sm:pl-6">
          <span aria-hidden="true" className={`absolute -left-[4px] top-2 h-2 w-2 rounded-full ${entry.badgeText ? "bg-teal" : "bg-slate-300"}`} />
          <div className="flex items-center gap-3 text-xs leading-6 text-slate-500 sm:block"><time>{entry.releaseDate ?? "历史记录"}</time>{entry.badgeText ? <span className="inline-block max-w-full break-words rounded bg-teal/10 px-2 py-0.5 text-teal sm:mt-2">{entry.badgeText}</span> : null}</div>
          <div className="min-w-0 border-b border-slate-100 pb-6">
            <button type="button" disabled={pending} onClick={(event) => open(entry, event.currentTarget)} className="text-left text-base font-bold leading-7 text-ink hover:text-teal focus-visible:outline-teal disabled:opacity-60 sm:text-lg"><span className="break-words">{entry.title}</span><ArrowRight size={15} className="ml-2 inline" /></button>
            {entry.summary ? <p className="mt-2 break-words text-sm leading-7 text-slate-600">{entry.summary}</p> : null}
          </div>
        </li>)}
      </ol>}
      {hasMore ? <div className="text-center"><button className="secondary-button disabled:opacity-50" type="button" disabled={pending} onClick={() => {
        setError("");
        startTransition(async () => {
          try {
            const page = await loadChangelogs(offset);
            setEntries((old) => [...old, ...page.entries.filter((entry) => !old.some((item) => item.id === entry.id))]);
            setOffset((old) => old + page.entries.length);
            setHasMore(page.hasMore);
          } catch { setError("加载失败，请稍后重试。"); }
        });
      }}>{pending ? "加载中…" : "加载更多"}</button></div> : null}
    </div>
    {detail ? <article>
      <button type="button" className="mb-6 inline-flex items-center gap-2 text-sm text-slate-600 hover:text-teal" onClick={() => {
        setDetail(null); setError("");
        requestAnimationFrame(() => { selected.current?.focus({ preventScroll: true }); window.scrollTo({ top: scrollPosition.current }); });
      }}><ArrowLeft size={16} />返回更新日志</button>
      <h2 ref={heading} tabIndex={-1} className="break-words text-xl font-bold leading-8 text-ink outline-none">{detail.title}</h2>
      <p className="mb-8 mt-3 text-sm text-slate-500">{detail.releaseDate ?? "历史记录"}</p>
      <MarkdownContent content={detail.content} variant="help" />
    </article> : null}
  </div>;
}
