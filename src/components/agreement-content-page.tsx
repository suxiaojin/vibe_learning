import Link from "next/link";

export function AgreementContentPage({
  content,
  title
}: {
  content: string;
  title: string;
}) {
  return (
    <main className="min-h-dvh bg-[#f6f7fb] px-4 py-8">
      <section className="mx-auto w-full max-w-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5">
          <h1 className="text-2xl font-black text-[#292b52]">{title}</h1>
          <Link className="text-sm font-bold text-[#5d35ff]" href="/login">
            返回登录
          </Link>
        </div>
        <article className="whitespace-pre-wrap break-words pt-6 text-base leading-8 text-slate-700">
          {content}
        </article>
      </section>
    </main>
  );
}
