import Link from "next/link";

export default async function LoginPage({
  searchParams
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  return (
    <main className="mx-auto grid min-h-[calc(100dvh-73px)] max-w-6xl place-items-center px-4 py-10">
      <section className="grid w-full max-w-4xl overflow-hidden rounded-3xl bg-white shadow-soft md:grid-cols-[1fr_420px]">
        <div className="bg-ink p-8 text-white">
          <p className="text-sm font-semibold text-honey">江苏专转本 · 计算机</p>
          <h1 className="mt-4 text-4xl font-bold leading-tight">每天推进一个知识点。</h1>
          <p className="mt-4 max-w-sm text-slate-300">
            像闯关一样复习，用 AI 把每道题讲到能听懂为止。
          </p>
        </div>
        <form action="/api/auth/login" method="post" className="p-8">
          <h2 className="text-2xl font-bold text-ink">登录</h2>
          {params?.error ? <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{params.error}</p> : null}
          <div className="mt-6">
            <label className="label" htmlFor="username">用户名</label>
            <input className="input" id="username" name="username" required autoComplete="username" />
          </div>
          <div className="mt-4">
            <label className="label" htmlFor="password">密码</label>
            <input className="input" id="password" name="password" required type="password" autoComplete="current-password" />
          </div>
          <button className="primary-button mt-6 w-full" type="submit">进入学习</button>
          <p className="mt-4 text-center text-sm text-slate-600">
            还没有账号？ <Link className="font-semibold text-teal" href="/register">立即注册</Link>
          </p>
        </form>
      </section>
    </main>
  );
}
