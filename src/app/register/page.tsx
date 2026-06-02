import Link from "next/link";
import { Gift, Lock, Mail, Smartphone } from "lucide-react";
import { getSystemSettings } from "@/lib/system-settings";

export default async function RegisterPage({
  searchParams
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const settings = await getSystemSettings();

  return (
    <main className="min-h-[calc(100dvh-73px)] bg-white">
      <section className="grid min-h-[calc(100dvh-73px)] lg:grid-cols-[39.5vw_1fr]">
        <div className="relative hidden min-h-full overflow-hidden bg-[#5d35ff] lg:block">
          <img
            alt="VibeLearning 注册页学习插图"
            className="absolute inset-0 size-full object-cover"
            src={settings.loginHeroImageUrl}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#5836ff]/10 via-transparent to-[#120828]/20" />
        </div>

        <div className="flex min-h-full flex-col bg-white">
          <div className="flex min-h-[96px] items-center gap-5 bg-[#f4f6fa] px-8 py-4">
            <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-white text-[#6d35ff] shadow-sm">
              <Gift size={32} strokeWidth={1.8} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-black text-[#181b2f]">{settings.loginMarketingTitle}</p>
              <p className="mt-1 line-clamp-2 text-sm font-medium text-[#202438]">{settings.loginMarketingDescription}</p>
            </div>
            <Link className="shrink-0 text-sm font-bold text-[#5d35ff] transition hover:text-[#3f22c8]" href="/login">
              登录
            </Link>
          </div>

          <form className="mx-auto flex w-full max-w-[500px] flex-1 flex-col px-6 py-8 sm:px-10">
            <h1 className="text-center text-3xl font-black leading-tight text-[#292b52] sm:text-[34px]">创建 VibeLearning 账号</h1>
            {params?.error ? <p className="mt-5 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{params.error}</p> : null}

            <div className="mt-8 grid gap-4">
              <label
                htmlFor="phoneNumber"
                className="grid min-h-[54px] grid-cols-[24px_1fr] items-center gap-3 rounded-lg border border-[#cfd8ea] bg-white px-4 transition focus-within:border-[#6d35ff] focus-within:ring-2 focus-within:ring-[#6d35ff]/10"
              >
                <Smartphone className="text-slate-400" size={19} />
                <input
                  autoComplete="tel"
                  className="min-w-0 border-none text-base outline-none placeholder:text-[#9aa4b7]"
                  id="phoneNumber"
                  name="phoneNumber"
                  placeholder="手机号码"
                  required
                  type="tel"
                />
              </label>

              <label
                htmlFor="email"
                className="grid min-h-[54px] grid-cols-[24px_1fr] items-center gap-3 rounded-lg border border-[#cfd8ea] bg-white px-4 transition focus-within:border-[#6d35ff] focus-within:ring-2 focus-within:ring-[#6d35ff]/10"
              >
                <Mail className="text-slate-400" size={19} />
                <input
                  autoComplete="email"
                  className="min-w-0 border-none text-base outline-none placeholder:text-[#9aa4b7]"
                  id="email"
                  name="email"
                  placeholder="邮箱地址"
                  required
                  type="email"
                />
              </label>

              <div className="grid min-h-[54px] grid-cols-[1fr_118px] overflow-hidden rounded-lg border border-[#cfd8ea] bg-white">
                <input
                  className="min-w-0 border-none px-4 text-base outline-none placeholder:text-[#9aa4b7]"
                  name="emailCode"
                  placeholder="邮箱验证码"
                  required
                />
                <button
                  className="border-l border-[#cfd8ea] text-sm font-black text-[#6d35ff] transition hover:bg-[#f7f4ff]"
                  type="button"
                >
                  获取验证码
                </button>
              </div>

              <label
                htmlFor="password"
                className="grid min-h-[54px] grid-cols-[24px_1fr] items-center gap-3 rounded-lg border border-[#cfd8ea] bg-white px-4 transition focus-within:border-[#6d35ff] focus-within:ring-2 focus-within:ring-[#6d35ff]/10"
              >
                <Lock className="text-slate-400" size={19} />
                <input
                  autoComplete="new-password"
                  className="min-w-0 border-none text-base outline-none placeholder:text-[#9aa4b7]"
                  id="password"
                  minLength={6}
                  name="password"
                  placeholder="密码"
                  required
                  type="password"
                />
              </label>

              <label
                htmlFor="confirmPassword"
                className="grid min-h-[54px] grid-cols-[24px_1fr] items-center gap-3 rounded-lg border border-[#cfd8ea] bg-white px-4 transition focus-within:border-[#6d35ff] focus-within:ring-2 focus-within:ring-[#6d35ff]/10"
              >
                <Lock className="text-slate-400" size={19} />
                <input
                  autoComplete="new-password"
                  className="min-w-0 border-none text-base outline-none placeholder:text-[#9aa4b7]"
                  id="confirmPassword"
                  minLength={6}
                  name="confirmPassword"
                  placeholder="确认密码"
                  required
                  type="password"
                />
              </label>
            </div>

            <label className="mt-5 flex min-h-9 items-center gap-2 text-sm text-[#444b60]">
              <input className="size-4 rounded border-slate-300 accent-[#6d35ff]" name="agreement" type="checkbox" required />
              <span>
                我同意
                <Link className="mx-1 font-semibold text-[#5d35ff]" href="#">
                  平台使用协议
                </Link>
                和
                <Link className="ml-1 font-semibold text-[#5d35ff]" href="#">
                  隐私政策
                </Link>
              </span>
            </label>

            <button
              className="mt-5 flex min-h-[54px] w-full items-center justify-center rounded-lg bg-[#6d28f4] text-xl font-black text-white transition hover:bg-[#5920cf]"
              type="button"
            >
              注册
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
