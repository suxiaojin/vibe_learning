"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Save, ArrowLeft } from "lucide-react";
import { saveAgreement, saveChangelog, withdrawChangelog } from "@/app/admin/settings/agreement-actions";
import { agreementFields, type AgreementKey } from "@/lib/changelog-validation";
import { cn } from "@/lib/utils";

type Entry = { id: string; title: string; badgeText: string; summary: string; content: string; releaseDate: string | null; isPublished: boolean };
type Editor = Omit<Entry, "releaseDate"> & { releaseDate: string };

export function AdminAgreementSettings({ contents, entries }: { contents: Record<AgreementKey, string>; entries: Entry[] }) {
  const router = useRouter();
  const [active, setActive] = useState<AgreementKey | "changelog">("userAgreementContent");
  const [values, setValues] = useState(contents);
  const [saved, setSaved] = useState(contents);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [baseline, setBaseline] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const submitting = useRef(false);
  const dirty = active === "changelog" ? !!editor && JSON.stringify(editor) !== baseline : values[active] !== saved[active];

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (submitting.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const onLink = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest("a[href]")) return;
      if (submitting.current || !window.confirm("当前内容尚未保存，确定离开吗？")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", onLink, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", onLink, true);
    };
  }, [dirty]);

  function canLeave() {
    return !pending && (!dirty || window.confirm("当前内容尚未保存，确定放弃修改吗？"));
  }
  function switchSection(key: typeof active) {
    if (key === active || !canLeave()) return;
    setValues(saved);
    setEditor(null);
    setActive(key);
    setMessage("");
    setError("");
  }
  function openEditor(entry?: Entry) {
    if (!canLeave()) return;
    const next: Editor = entry ? { ...entry, releaseDate: entry.releaseDate ?? "" } : {
      id: "", title: "", badgeText: "", summary: "", content: "", releaseDate: new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" }).format(new Date()), isPublished: false
    };
    setEditor(next);
    setBaseline(JSON.stringify(next));
    setMessage("");
    setError("");
  }
  function runSave(operation: () => Promise<{ error?: string; success?: boolean }>, success: () => void) {
    if (submitting.current) return;
    submitting.current = true;
    setError("");
    setMessage("");
    startTransition(async () => {
      try {
        const result = await operation();
        if (result.error) setError(result.error);
        else { success(); router.refresh(); }
      } catch {
        setError("保存失败，请稍后重试；当前编辑内容已保留。");
      } finally { submitting.current = false; }
    });
  }

  return (
    <section className="border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-lg font-black text-ink">协议内容</h2>
      <p className="mt-1 text-sm text-slate-500">选择左侧栏目编辑，各栏目单独保存。更新日志可持续新增并保留历史记录。</p>
      <div className="mt-5 grid items-start gap-6 md:grid-cols-[200px_minmax(0,1fr)]">
        <nav aria-label="协议内容栏目" className="flex overflow-x-auto border-b border-slate-200 md:block md:border-b-0 md:border-r">
          {[...agreementFields, { key: "changelog" as const, label: "更新日志" }].map((field) => (
            <button key={field.key} type="button" aria-current={active === field.key ? "page" : undefined} disabled={pending}
              onClick={() => switchSection(field.key)}
              className={cn("shrink-0 border-b-2 px-4 py-4 text-left text-sm md:block md:w-full md:border-b-0 md:border-l-4 disabled:opacity-50", active === field.key ? "border-teal bg-teal/5 font-bold text-ink" : "border-transparent text-slate-600 hover:bg-slate-50")}>{field.label}</button>
          ))}
        </nav>
        <div className="min-w-0">
          {error ? <p role="alert" className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
          {message ? <p role="status" className="mb-4 rounded bg-teal/5 p-3 text-sm text-teal">{message}</p> : null}
          {active !== "changelog" ? (
            <form onSubmit={(event) => {
              event.preventDefault();
              const key = active;
              const content = values[key];
              const form = new FormData(); form.set("key", key); form.set("content", content);
              runSave(() => saveAgreement(form), () => { setSaved((old) => ({ ...old, [key]: content })); setMessage("已保存当前栏目。"); });
            }}>
              <label htmlFor="agreement-content" className="block font-bold text-ink">{agreementFields.find((field) => field.key === active)?.label}</label>
              <p className="mb-4 mt-2 text-xs text-slate-500">支持 Markdown 标题、列表、表格、图片和链接，正文需自带完整标题。</p>
              <textarea id="agreement-content" className="input min-h-[480px] w-full" value={values[active]} required maxLength={200000} disabled={pending}
                onChange={(event) => setValues({ ...values, [active]: event.target.value })} />
              <button className="primary-button mt-4 disabled:opacity-50" disabled={pending} type="submit"><Save size={16} />{pending ? "保存中…" : "保存当前栏目"}</button>
            </form>
          ) : editor ? (
            <form onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const submitter = (event.nativeEvent as SubmitEvent).submitter;
              form.set("isPublished", submitter instanceof HTMLButtonElement ? submitter.value : String(editor.isPublished));
              runSave(() => saveChangelog(form), () => { setEditor(null); setMessage("更新日志已保存。"); });
            }}>
              <button className="mb-4 inline-flex items-center gap-2 text-sm text-slate-600" type="button" disabled={pending} onClick={() => { if (canLeave()) { setEditor(null); setError(""); } }}><ArrowLeft size={16} />返回日志列表</button>
              <h3 className="mb-5 font-bold text-ink">{editor.id ? "编辑更新日志" : "新增更新日志"}</h3>
              <input type="hidden" name="id" value={editor.id} />
              <fieldset disabled={pending} className="space-y-4 disabled:opacity-60">
                <label className="block text-sm font-semibold">标题<input name="title" className="input mt-2 w-full" required maxLength={120} value={editor.title} onChange={(event) => setEditor({ ...editor, title: event.target.value })} /></label>
                <label className="block text-sm font-semibold">展示标签（选填）<input name="badgeText" className="input mt-2 w-full" maxLength={20} placeholder="例如：最新、重磅、功能升级" value={editor.badgeText} onChange={(event) => setEditor({ ...editor, badgeText: event.target.value })} /><span className="mt-1.5 block text-xs font-normal text-slate-500">显示在学生端日期下方，最多 20 字；留空则不显示。</span></label>
                <label className="block text-sm font-semibold">发布日期<input name="releaseDate" type="date" className="input mt-2 block" required value={editor.releaseDate} onChange={(event) => setEditor({ ...editor, releaseDate: event.target.value })} /></label>
                {!editor.releaseDate ? <p className="text-xs text-slate-500">原有内容未记录发布日期，请按实际情况补填。</p> : null}
                <label className="block text-sm font-semibold">摘要（选填）<textarea name="summary" className="input mt-2 min-h-20 w-full" maxLength={300} value={editor.summary} onChange={(event) => setEditor({ ...editor, summary: event.target.value })} /></label>
                <label className="block text-sm font-semibold">正文<textarea name="content" className="input mt-2 min-h-80 w-full" required maxLength={200000} value={editor.content} onChange={(event) => setEditor({ ...editor, content: event.target.value })} /></label>
                <p className="text-xs text-slate-500">正文支持 Markdown。发布日期用于展示和排序，点击发布后立即对学生可见。</p>
                <div className="flex flex-wrap gap-3">
                  <button className="primary-button" name="isPublished" value="true" type="submit">{pending ? "保存中…" : editor.isPublished ? "保存并保持发布" : "发布日志"}</button>
                  <button className="secondary-button" name="isPublished" value="false" type="submit">{editor.isPublished ? "保存并撤下" : "保存草稿"}</button>
                </div>
              </fieldset>
            </form>
          ) : (
            <>
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h3 className="font-bold text-ink">更新日志</h3><button className="primary-button" type="button" disabled={pending} onClick={() => openEditor()}><Plus size={16} />新增更新日志</button></div>
              {!entries.length ? <p className="py-12 text-center text-sm text-slate-500">暂无更新日志，点击上方按钮新增。</p> : (
                <ul className="divide-y divide-slate-100">
                  {entries.map((entry) => <li key={entry.id} className="flex flex-wrap items-start justify-between gap-3 py-5">
                    <div className="min-w-0 flex-1"><p className="break-words font-semibold text-ink">{entry.title}</p><p className="mt-2 text-xs text-slate-500">{entry.releaseDate ?? "历史记录 · 日期待补充"}<span className={cn("ml-3", entry.isPublished ? "text-teal" : "text-slate-500")}>{entry.isPublished ? "已发布" : "草稿"}</span>{entry.badgeText ? <span className="ml-3 rounded bg-teal/10 px-2 py-0.5 text-teal">标签：{entry.badgeText}</span> : null}</p>{entry.summary ? <p className="mt-2 break-words text-sm text-slate-600">{entry.summary}</p> : null}</div>
                    <div className="flex gap-4 text-sm"><button type="button" className="text-teal" disabled={pending} onClick={() => openEditor(entry)}>编辑</button>{entry.isPublished ? <button type="button" className="text-slate-500" disabled={pending} onClick={() => {
                      if (window.confirm("撤下后学生将无法查看这条日志，之后可重新编辑发布。确定撤下吗？")) runSave(() => withdrawChangelog(entry.id), () => setMessage("已撤下，内容保留为草稿。"));
                    }}>撤下</button> : null}</div>
                  </li>)}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
