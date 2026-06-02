"use client";

import Link from "next/link";
import { Eye, EyeOff, Gift, Lock, Mail, UserRound } from "lucide-react";
import { useState } from "react";
import type { PublicSystemSettings } from "@/lib/system-settings";
import { cn } from "@/lib/utils";

function TabButton({
  active,
  children,
  onClick
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={cn(
        "relative h-11 min-w-28 px-4 text-base font-black transition",
        active ? "text-[#2f315f]" : "text-slate-500 hover:text-[#2f315f]"
      )}
      onClick={onClick}
    >
      {children}
      <span
        className={cn(
          "absolute inset-x-4 -bottom-px h-0.5 rounded-full bg-[#6d35ff] transition-opacity",
          active ? "opacity-100" : "opacity-0"
        )}
      />
    </button>
  );
}

function FormField({
  icon,
  id,
  label,
  name,
  placeholder,
  type = "text",
  autoComplete,
  trailing
}: {
  icon: React.ReactNode;
  id: string;
  label: string;
  name: string;
  placeholder: string;
  type?: string;
  autoComplete?: string;
  trailing?: React.ReactNode;
}) {
  return (
    <label
      htmlFor={id}
      className="grid min-h-[58px] grid-cols-[24px_1fr_auto] items-center gap-3 border border-[#dfe3eb] bg-white px-4 transition focus-within:border-[#6d35ff] focus-within:ring-2 focus-within:ring-[#6d35ff]/10"
    >
      <span className="text-slate-400">{icon}</span>
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-[#5f6474]">{label}</span>
        <input
          id={id}
          name={name}
          type={type}
          className="mt-0.5 h-6 w-full border-none bg-transparent p-0 text-sm text-[#252a3d] outline-none placeholder:text-[#9aa4b7]"
          placeholder={placeholder}
          required
          autoComplete={autoComplete}
        />
      </span>
      {trailing}
    </label>
  );
}

function AgreementLine({ showForgot = false }: { showForgot?: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[#444b60]">
      <label className="flex min-h-9 items-center gap-2">
        <input className="size-4 rounded border-slate-300 accent-[#6d35ff]" name="agreement" type="checkbox" required />
        <span>
          阅读并同意
          <Link className="mx-1 font-semibold text-[#5d35ff]" href="#">
            用户协议
          </Link>
          与
          <Link className="ml-1 font-semibold text-[#5d35ff]" href="#">
            隐私政策
          </Link>
        </span>
      </label>
      {showForgot ? (
        <Link className="min-h-9 font-semibold text-[#5d35ff]" href="#">
          忘记密码
        </Link>
      ) : null}
    </div>
  );
}

export function LoginPanel({
  settings,
  error
}: {
  settings: PublicSystemSettings;
  error?: string;
}) {
  const [tab, setTab] = useState<"password" | "email">("password");
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="flex min-h-full flex-col bg-white">
      <div className="flex min-h-[96px] items-center gap-5 bg-[#f4f6fa] px-8 py-4">
        <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-white text-[#6d35ff] shadow-sm">
          <Gift size={32} strokeWidth={1.8} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-black text-[#181b2f]">{settings.loginMarketingTitle}</p>
          <p className="mt-1 line-clamp-2 text-sm font-medium text-[#202438]">{settings.loginMarketingDescription}</p>
        </div>
        <Link className="shrink-0 text-sm font-bold text-[#5d35ff] transition hover:text-[#3f22c8]" href="/register">
          注册
        </Link>
      </div>

      <div className="mx-auto flex w-full max-w-[500px] flex-1 flex-col px-6 py-8 sm:px-10">
        <h1 className="text-center text-3xl font-black leading-tight text-[#292b52] sm:text-[34px]">
          {settings.loginWelcomeTitle}
        </h1>

        <div className="mt-5 flex justify-center gap-8 border-b border-transparent" role="tablist" aria-label="登录方式">
          <TabButton active={tab === "password"} onClick={() => setTab("password")}>
            密码登录
          </TabButton>
          <TabButton active={tab === "email"} onClick={() => setTab("email")}>
            邮箱登录
          </TabButton>
        </div>

        {error ? <p className="mt-5 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}

        {tab === "password" ? (
          <form action="/api/auth/login" method="post" className="mt-10 grid gap-9">
            <div className="grid gap-9">
              <FormField
                autoComplete="username"
                icon={<UserRound size={19} />}
                id="username"
                label="账号名"
                name="username"
                placeholder="账号名"
              />
              <FormField
                autoComplete="current-password"
                icon={<Lock size={19} />}
                id="password"
                label="密码"
                name="password"
                placeholder="请输入登录密码"
                type={showPassword ? "text" : "password"}
                trailing={
                  <button
                    aria-label={showPassword ? "隐藏密码" : "显示密码"}
                    className="grid size-10 place-items-center text-slate-500 transition hover:text-[#5d35ff]"
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                }
              />
            </div>

            <AgreementLine showForgot />

            <button
              className="flex min-h-[54px] w-full items-center justify-center bg-[#8d7cf5] text-xl font-black text-white transition hover:bg-[#745df0]"
              type="submit"
            >
              登录
            </button>
          </form>
        ) : (
          <form className="mt-10 grid gap-5">
            <FormField
              autoComplete="email"
              icon={<Mail size={19} />}
              id="email-login"
              label="账号邮箱"
              name="email"
              placeholder="账号邮箱"
              type="email"
            />
            <div className="grid min-h-[50px] grid-cols-[1fr_118px] overflow-hidden border border-[#d1d8e6] bg-white">
              <input
                className="min-w-0 border-none px-4 text-sm outline-none placeholder:text-[#9aa4b7]"
                name="emailCode"
                placeholder="验证码"
                required
              />
              <button
                className="border-l border-[#d1d8e6] text-sm font-black text-[#6d35ff] transition hover:bg-[#f7f4ff]"
                type="button"
              >
                获取验证码
              </button>
            </div>
            <AgreementLine />
            <button
              className="flex min-h-[54px] w-full items-center justify-center rounded-lg bg-[#6d28f4] text-xl font-black text-white transition hover:bg-[#5920cf]"
              type="button"
            >
              登录
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
