import Link from "next/link";

export default async function RegisterPage({
  searchParams
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  return (
    <main className="mx-auto grid min-h-[calc(100dvh-73px)] max-w-6xl place-items-center px-4 py-10">
      <form action="/api/auth/register" method="post" className="panel w-full max-w-md">
        <h1 className="text-2xl font-bold text-ink">创建学习账号</h1>
        <p className="mt-2 text-sm text-slate-600">MVP 阶段只需要用户名和密码。</p>
        {params?.error ? <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{params.error}</p> : null}
        <div className="mt-6">
          <label className="label" htmlFor="username">用户名</label>
          <input className="input" id="username" name="username" required minLength={3} autoComplete="username" />
        </div>
        <div className="mt-4">
          <label className="label" htmlFor="password">密码</label>
          <input className="input" id="password" name="password" required minLength={6} type="password" autoComplete="new-password" />
        </div>
        <button className="primary-button mt-6 w-full" type="submit">注册并开始</button>
        <p className="mt-4 text-center text-sm text-slate-600">
          已有账号？ <Link className="font-semibold text-teal" href="/login">去登录</Link>
        </p>
      </form>
    </main>
  );
}
