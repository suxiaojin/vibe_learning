"use client";

import Link from "next/link";
import { KeyRound, Mail } from "lucide-react";
import { FormEvent, useState } from "react";
import type { PublicSystemSettings } from "@/lib/system-settings";
import { cn } from "@/lib/utils";

type ApiResponse = {
  ok?: boolean;
  data?: {
    message?: string;
    cooldownSeconds?: number;
  };
  error?: {
    message?: string;
    waitSeconds?: number;
  };
};

export function ForgotPasswordPanel({ settings }: { settings: PublicSystemSettings }) {
  const [email, setEmail] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [sending, setSending] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [statusType, setStatusType] = useState<"error" | "success">("success");
  const [passwordSent, setPasswordSent] = useState(false);

  function showError(message: string) {
    setStatusType("error");
    setStatusText(message);
  }

  function showSuccess(message: string) {
    setStatusType("success");
    setStatusText(message);
  }

  async function requestTemporaryPassword() {
    if (!email.trim()) {
      showError("请先填写账号邮箱。");
      return;
    }

    setSending(true);
    try {
      const response = await fetch("/api/auth/password-reset/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const payload = (await response.json().catch(() => null)) as ApiResponse | null;

      if (!response.ok || !payload?.ok) {
        showError(payload?.error?.message || "新密码发送失败，请稍后再试。");
        return;
      }

      setPasswordSent(true);
      showSuccess(payload.data?.message || "新密码已发送，请查收邮箱。");
    } catch {
      showError("新密码发送失败，请检查网络后重试。");
    } finally {
      setSending(false);
    }
  }

  function handleLogin(event: FormEvent<HTMLFormElement>) {
    if (!passwordSent) {
      event.preventDefault();
      showError("请先获取新密码。");
    }
  }

  return (
    <div className="flex min-h-full flex-col bg-white">
      <div className="flex min-h-[88px] items-center justify-end bg-[#f4f6fa] px-8 py-4">
        <Link className="text-sm font-bold text-[#5d35ff] transition hover:text-[#3f22c8]" href="/login">
          返回登录
        </Link>
      </div>

      <div className="mx-auto flex w-full max-w-[500px] flex-1 flex-col px-6 py-8 sm:px-10">
        <h1 className="text-center text-3xl font-black leading-tight text-[#292b52] sm:text-[34px]">找回密码</h1>

        <form action="/api/auth/login" method="post" className="mt-10 grid gap-5" onSubmit={handleLogin}>
          <label
            htmlFor="reset-email"
            className="grid min-h-[58px] grid-cols-[24px_1fr] items-center gap-3 border border-[#dfe3eb] bg-white px-4 transition focus-within:border-[#6d35ff] focus-within:ring-2 focus-within:ring-[#6d35ff]/10"
          >
            <Mail className="text-slate-400" size={19} />
            <span className="min-w-0">
              <span className="block text-xs font-semibold text-[#5f6474]">账号邮箱</span>
              <input
                autoComplete="email"
                className="mt-0.5 h-6 w-full border-none bg-transparent p-0 text-sm text-[#252a3d] outline-none placeholder:text-[#9aa4b7]"
                id="reset-email"
                name="username"
                placeholder="账号邮箱"
                required
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setPasswordSent(false);
                  setTemporaryPassword("");
                }}
              />
            </span>
          </label>

          <button
            className="flex min-h-[50px] w-full items-center justify-center rounded-lg border border-[#d1d8e6] text-sm font-black text-[#6d35ff] transition hover:bg-[#f7f4ff] disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
            disabled={sending}
            type="button"
            onClick={requestTemporaryPassword}
          >
            {sending ? "发送中" : "获取新密码"}
          </button>

          <label
            htmlFor="temporary-password"
            className="grid min-h-[58px] grid-cols-[24px_1fr] items-center gap-3 border border-[#dfe3eb] bg-white px-4 transition focus-within:border-[#6d35ff] focus-within:ring-2 focus-within:ring-[#6d35ff]/10"
          >
            <KeyRound className="text-slate-400" size={19} />
            <span className="min-w-0">
              <span className="block text-xs font-semibold text-[#5f6474]">新密码</span>
              <input
                autoComplete="current-password"
                className="mt-0.5 h-6 w-full border-none bg-transparent p-0 text-sm text-[#252a3d] outline-none placeholder:text-[#9aa4b7]"
                id="temporary-password"
                inputMode="numeric"
                maxLength={6}
                minLength={6}
                name="password"
                pattern="[0-9]{6}"
                placeholder="请输入邮箱中的 6 位新密码"
                required
                type="password"
                value={temporaryPassword}
                onChange={(event) => setTemporaryPassword(event.target.value.replace(/\D/g, "").slice(0, 6))}
              />
            </span>
          </label>

          {statusText ? (
            <p
              className={cn(
                "px-4 py-3 text-sm font-semibold",
                statusType === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
              )}
            >
              {statusText}
            </p>
          ) : null}

          <button
            className="flex min-h-[54px] w-full items-center justify-center rounded-lg bg-[#6d28f4] text-xl font-black text-white transition hover:bg-[#5920cf]"
            type="submit"
          >
            登录
          </button>
        </form>

        <p className="mt-5 text-center text-xs font-medium text-[#6b7280]">
          如需帮助，请与客服联系：
          <a className="font-bold text-[#5d35ff] hover:text-[#3f22c8]" href={`mailto:${settings.customerServiceEmail}`}>
            {settings.customerServiceEmail}
          </a>
        </p>
      </div>
    </div>
  );
}
