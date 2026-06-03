"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpenCheck, Gift, GraduationCap, Lock, Mail, Smartphone, Sparkles, Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { PublicSystemSettings } from "@/lib/system-settings";
import { cn } from "@/lib/utils";

const marketingIconMap = {
  book: BookOpenCheck,
  gift: Gift,
  graduation: GraduationCap,
  sparkles: Sparkles,
  trophy: Trophy
};

type RegisterResponse = {
  ok: boolean;
  data?: {
    message?: string;
    redirectTo?: string;
    cooldownSeconds?: number;
  };
  error?: {
    message?: string;
    waitSeconds?: number;
  };
};

function FieldShell({
  children,
  htmlFor,
  icon
}: {
  children: ReactNode;
  htmlFor: string;
  icon: ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="grid min-h-[54px] grid-cols-[24px_1fr] items-center gap-3 rounded-lg border border-[#cfd8ea] bg-white px-4 transition focus-within:border-[#6d35ff] focus-within:ring-2 focus-within:ring-[#6d35ff]/10"
    >
      {icon}
      {children}
    </label>
  );
}

export function RegisterPanel({
  error,
  settings
}: {
  error?: string;
  settings: PublicSystemSettings;
}) {
  const router = useRouter();
  const MarketingIcon = marketingIconMap[settings.loginMarketingIcon as keyof typeof marketingIconMap] || Gift;
  const [phoneNumber, setPhoneNumber] = useState("");
  const [email, setEmail] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agreement, setAgreement] = useState(false);
  const [statusText, setStatusText] = useState(error || "");
  const [statusType, setStatusType] = useState<"error" | "success">(error ? "error" : "success");
  const [cooldown, setCooldown] = useState(0);
  const [sendingCode, setSendingCode] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) {
      return;
    }
    const timer = window.setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  function showError(message: string) {
    setStatusType("error");
    setStatusText(message);
  }

  function showSuccess(message: string) {
    setStatusType("success");
    setStatusText(message);
  }

  async function handleSendCode() {
    if (!email.trim()) {
      showError("请先填写邮箱地址。");
      return;
    }

    setSendingCode(true);
    try {
      const response = await fetch("/api/auth/email-code/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const payload = (await response.json().catch(() => null)) as RegisterResponse | null;
      if (!response.ok || !payload?.ok) {
        const waitSeconds = payload?.error?.waitSeconds;
        if (typeof waitSeconds === "number") {
          setCooldown(waitSeconds);
        }
        showError(payload?.error?.message || "验证码发送失败，请稍后再试。");
        return;
      }

      setCooldown(payload.data?.cooldownSeconds || 60);
      showSuccess(payload.data?.message || "验证码已发送，请查收邮箱。");
    } catch {
      showError("验证码发送失败，请检查网络后重试。");
    } finally {
      setSendingCode(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirmPassword) {
      showError("两次输入的密码不一致。");
      return;
    }
    if (!agreement) {
      showError("请先同意平台使用协议和隐私政策。");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber,
          email,
          emailCode,
          password,
          confirmPassword,
          agreement
        })
      });
      const payload = (await response.json().catch(() => null)) as RegisterResponse | null;
      if (!response.ok || !payload?.ok) {
        showError(payload?.error?.message || "注册失败，请稍后再试。");
        return;
      }

      showSuccess(payload.data?.message || "恭喜！注册成功");
      window.setTimeout(() => router.push(payload.data?.redirectTo || "/login"), 1200);
    } catch {
      showError("注册失败，请检查网络后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col bg-white">
      <div className="flex min-h-[96px] items-center gap-5 bg-[#f4f6fa] px-8 py-4">
        <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-white text-[#6d35ff] shadow-sm">
          <MarketingIcon size={32} strokeWidth={1.8} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-black text-[#181b2f]">{settings.loginMarketingTitle}</p>
          <p className="mt-1 line-clamp-2 text-sm font-medium text-[#202438]">{settings.loginMarketingDescription}</p>
        </div>
        <Link className="shrink-0 text-sm font-bold text-[#5d35ff] transition hover:text-[#3f22c8]" href="/login">
          登录
        </Link>
      </div>

      <form className="mx-auto flex w-full max-w-[500px] flex-1 flex-col px-6 py-8 sm:px-10" onSubmit={handleSubmit}>
        <h1 className="text-center text-3xl font-black leading-tight text-[#292b52] sm:text-[34px]">创建 VibeLearning 账号</h1>
        {statusText ? (
          <p
            className={cn(
              "mt-5 px-4 py-3 text-sm font-semibold",
              statusType === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
            )}
          >
            {statusText}
          </p>
        ) : null}

        <div className="mt-8 grid gap-4">
          <FieldShell htmlFor="phoneNumber" icon={<Smartphone className="text-slate-400" size={19} />}>
            <input
              autoComplete="tel"
              className="min-w-0 border-none text-base outline-none placeholder:text-[#9aa4b7]"
              id="phoneNumber"
              name="phoneNumber"
              placeholder="手机号码"
              required
              type="tel"
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(event.target.value)}
            />
          </FieldShell>

          <FieldShell htmlFor="email" icon={<Mail className="text-slate-400" size={19} />}>
            <input
              autoComplete="email"
              className="min-w-0 border-none text-base outline-none placeholder:text-[#9aa4b7]"
              id="email"
              name="email"
              placeholder="邮箱地址"
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </FieldShell>

          <div className="grid min-h-[54px] grid-cols-[1fr_118px] overflow-hidden rounded-lg border border-[#cfd8ea] bg-white">
            <input
              autoComplete="one-time-code"
              className="min-w-0 border-none px-4 text-base outline-none placeholder:text-[#9aa4b7]"
              inputMode="numeric"
              maxLength={4}
              name="emailCode"
              pattern="[0-9]{4}"
              placeholder="邮箱验证码"
              required
              value={emailCode}
              onChange={(event) => setEmailCode(event.target.value.replace(/\D/g, "").slice(0, 4))}
            />
            <button
              className="border-l border-[#cfd8ea] text-sm font-black text-[#6d35ff] transition hover:bg-[#f7f4ff] disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
              disabled={sendingCode || cooldown > 0}
              type="button"
              onClick={handleSendCode}
            >
              {cooldown > 0 ? `${cooldown}s` : sendingCode ? "发送中" : "获取验证码"}
            </button>
          </div>

          <FieldShell htmlFor="password" icon={<Lock className="text-slate-400" size={19} />}>
            <input
              autoComplete="new-password"
              className="min-w-0 border-none text-base outline-none placeholder:text-[#9aa4b7]"
              id="password"
              minLength={6}
              name="password"
              placeholder="密码"
              required
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </FieldShell>

          <FieldShell htmlFor="confirmPassword" icon={<Lock className="text-slate-400" size={19} />}>
            <input
              autoComplete="new-password"
              className="min-w-0 border-none text-base outline-none placeholder:text-[#9aa4b7]"
              id="confirmPassword"
              minLength={6}
              name="confirmPassword"
              placeholder="确认密码"
              required
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </FieldShell>
        </div>

        <label className="mt-5 flex min-h-9 items-center gap-2 text-sm text-[#444b60]">
          <input
            className="size-4 rounded border-slate-300 accent-[#6d35ff]"
            name="agreement"
            required
            type="checkbox"
            checked={agreement}
            onChange={(event) => setAgreement(event.target.checked)}
          />
          <span>
            我同意
            <Link className="mx-1 font-semibold text-[#5d35ff]" href="/platform-agreement">
              平台使用协议
            </Link>
            和
            <Link className="ml-1 font-semibold text-[#5d35ff]" href="/privacy-policy">
              隐私政策
            </Link>
          </span>
        </label>

        <button
          className="mt-5 flex min-h-[54px] w-full items-center justify-center rounded-lg bg-[#6d28f4] text-xl font-black text-white transition hover:bg-[#5920cf] disabled:cursor-not-allowed disabled:bg-slate-400"
          disabled={submitting}
          type="submit"
        >
          {submitting ? "注册中" : "注册"}
        </button>
      </form>
    </div>
  );
}
