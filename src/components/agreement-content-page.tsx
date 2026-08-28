import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const markdownComponents: Components = {
  h1: ({ children }) => <h1 className="mt-8 text-2xl font-black leading-tight text-[#292b52] first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-8 border-b border-slate-200 pb-2 text-xl font-black leading-tight text-[#292b52] first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-6 text-lg font-bold leading-tight text-slate-800">{children}</h3>,
  h4: ({ children }) => <h4 className="mt-5 text-base font-bold leading-tight text-slate-800">{children}</h4>,
  p: ({ children }) => <p className="mt-4 break-words text-base leading-8 text-slate-700 first:mt-0">{children}</p>,
  ul: ({ children }) => <ul className="mt-4 list-disc space-y-2 pl-6 text-base leading-8 text-slate-700">{children}</ul>,
  ol: ({ children }) => <ol className="mt-4 list-decimal space-y-2 pl-6 text-base leading-8 text-slate-700">{children}</ol>,
  li: ({ children }) => <li className="pl-1">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="mt-5 border-l-4 border-[#7c5cff] bg-[#f6f3ff] px-4 py-3 text-slate-700">
      {children}
    </blockquote>
  ),
  strong: ({ children }) => <strong className="font-black text-slate-900">{children}</strong>,
  a: ({ children, href }) => {
    const external = Boolean(href && /^https?:\/\//i.test(href));
    return (
      <a
        className="font-bold text-[#5d35ff] underline decoration-[#b7a8ff] underline-offset-4 hover:text-[#3f22c8]"
        href={href}
        rel={external ? "noreferrer noopener" : undefined}
        target={external ? "_blank" : undefined}
      >
        {children}
      </a>
    );
  },
  hr: () => <hr className="my-8 border-slate-200" />,
  table: ({ children }) => (
    <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm leading-6">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-slate-100 text-slate-800">{children}</thead>,
  th: ({ children }) => <th className="border-b border-r border-slate-200 px-4 py-3 font-black last:border-r-0">{children}</th>,
  td: ({ children }) => <td className="border-b border-r border-slate-100 px-4 py-3 align-top text-slate-700 last:border-r-0">{children}</td>,
  pre: ({ children }) => <pre className="mt-5 overflow-x-auto rounded-xl bg-slate-950 p-4 text-sm leading-6 text-slate-100">{children}</pre>,
  code: ({ children, className }) => (
    <code className={className || "rounded bg-slate-100 px-1.5 py-0.5 text-[0.9em] font-semibold text-slate-800"}>{children}</code>
  )
};

const helpMarkdownComponents: Components = {
  ...markdownComponents,
  h1: ({ children }) => <h2 className="mb-4 mt-6 text-base font-semibold leading-7 text-ink first:mt-0">{children}</h2>,
  h2: ({ children }) => <h3 className="mb-2 mt-6 text-sm font-semibold leading-7 text-ink first:mt-0">{children}</h3>,
  h3: ({ children }) => <h4 className="mb-2 mt-5 text-sm font-semibold leading-7 text-ink">{children}</h4>,
  h4: ({ children }) => <h5 className="mb-2 mt-4 text-sm font-semibold leading-7 text-ink">{children}</h5>,
  h5: ({ children }) => <h6 className="mb-2 mt-4 text-sm font-semibold leading-7 text-ink">{children}</h6>,
  h6: ({ children }) => <h6 className="mb-2 mt-4 text-sm font-semibold leading-7 text-ink">{children}</h6>,
  p: ({ children }) => <p className="mt-3 break-words text-sm leading-8 text-slate-600 first:mt-0">{children}</p>,
  ul: ({ children }) => <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-8 text-slate-600">{children}</ul>,
  ol: ({ children }) => <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm leading-8 text-slate-600">{children}</ol>,
  strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
  blockquote: ({ children }) => <blockquote className="my-4 border-l-2 border-slate-200 pl-4 text-sm text-slate-600">{children}</blockquote>,
  a: ({ children, href }) => {
    const external = Boolean(href && /^https?:\/\//i.test(href));
    return (
      <a className="text-slate-700 underline underline-offset-4 hover:text-ink" href={href} rel={external ? "noreferrer noopener" : undefined} target={external ? "_blank" : undefined}>
        {children}
      </a>
    );
  },
  img: ({ alt, src }) => <img alt={alt || ""} className="my-4 h-auto max-w-full" loading="lazy" src={src} />,
  hr: () => <hr className="my-6 border-slate-100" />
};

export function MarkdownContent({ content, variant = "agreement" }: { content: string; variant?: "agreement" | "help" }) {
  return (
    <div className="break-words">
      <ReactMarkdown components={variant === "help" ? helpMarkdownComponents : markdownComponents} remarkPlugins={[remarkGfm]} skipHtml>
        {content}
      </ReactMarkdown>
    </div>
  );
}

export function AgreementContentPage({
  content
}: {
  content: string;
}) {
  return (
    <main className="min-h-dvh bg-[#f6f7fb] px-4 py-8">
      <section className="mx-auto w-full max-w-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex justify-end">
          <Link className="text-sm font-bold text-[#5d35ff]" href="/login">
            返回登录
          </Link>
        </div>
        <article className="pt-4">
          <MarkdownContent content={content} />
        </article>
      </section>
    </main>
  );
}
