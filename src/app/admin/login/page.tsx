import { redirect } from "next/navigation";
import { LockKeyhole, ShieldCheck, UserRound } from "lucide-react";
import { getCurrentAdmin } from "@/lib/auth";

export default async function AdminLoginPage({
  searchParams
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const admin = await getCurrentAdmin();
  if (admin) {
    redirect("/admin");
  }

  return (
    <main className="min-h-dvh bg-[#eef2f6] text-[#20242a]">
      <section className="mx-auto grid min-h-dvh w-full max-w-6xl items-center px-6 py-10 lg:grid-cols-[1fr_420px] lg:gap-12">
        <div className="hidden lg:block">
          <div className="flex items-center gap-4">
            <div className="grid size-14 place-items-center bg-[#263238] text-white">
              <ShieldCheck size={30} strokeWidth={1.9} />
            </div>
            <div>
              <p className="text-sm font-black text-[#0872b9]">VIBE LEARNING ADMIN</p>
              <h1 className="mt-3 text-4xl font-black leading-tight text-[#20242a]">江苏专转本后台题库管理系统</h1>
            </div>
          </div>
          <p className="mt-8 max-w-xl text-base font-medium leading-8 text-[#5b6570]">
            后台管理入口已与学生端登录分离。请使用管理员账号登录，学生账号无法进入本控制台。
          </p>
        </div>

        <div className="border border-slate-300 bg-white p-8 shadow-sm">
          <div className="mb-8">
            <p className="text-sm font-black text-[#0872b9]">管理控制台</p>
            <h2 className="mt-2 text-2xl font-black text-[#20242a]">管理员登录</h2>
          </div>

          {params?.error ? <p className="mb-5 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{params.error}</p> : null}

          <form action="/api/auth/admin-login" method="post" className="grid gap-5">
            <label className="grid min-h-[58px] grid-cols-[24px_1fr] items-center gap-3 border border-[#dfe3eb] bg-white px-4 focus-within:border-[#0872b9] focus-within:ring-2 focus-within:ring-[#0872b9]/10">
              <UserRound size={19} className="text-slate-400" />
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-[#5f6474]">账号名/邮箱</span>
                <input
                  className="mt-0.5 h-6 w-full border-none bg-transparent p-0 text-sm text-[#252a3d] outline-none placeholder:text-[#9aa4b7]"
                  name="username"
                  placeholder="管理员账号或邮箱"
                  autoComplete="username"
                  required
                />
              </span>
            </label>

            <label className="grid min-h-[58px] grid-cols-[24px_1fr] items-center gap-3 border border-[#dfe3eb] bg-white px-4 focus-within:border-[#0872b9] focus-within:ring-2 focus-within:ring-[#0872b9]/10">
              <LockKeyhole size={19} className="text-slate-400" />
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-[#5f6474]">密码</span>
                <input
                  className="mt-0.5 h-6 w-full border-none bg-transparent p-0 text-sm text-[#252a3d] outline-none placeholder:text-[#9aa4b7]"
                  name="password"
                  placeholder="请输入管理员密码"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </span>
            </label>

            <button className="mt-3 flex min-h-[52px] items-center justify-center bg-[#0872b9] text-base font-black text-white transition hover:bg-[#0767a8]" type="submit">
              登录后台
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
