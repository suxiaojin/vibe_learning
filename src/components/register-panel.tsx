"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpenCheck, CheckCircle2, Gift, GraduationCap, Lock, Mail, Smartphone, Sparkles, Trophy, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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

const phonePattern = /^1[3-9]\d{9}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FieldName = "username" | "password" | "confirmPassword" | "phoneNumber" | "email" | "emailCode";
type FieldErrors = Partial<Record<FieldName, string>>;
type UsernameStatus = "idle" | "checking" | "available" | "taken" | "error";

type RegisterResponse = {
  ok: boolean;
  data?: {
    message?: string;
    redirectTo?: string;
    cooldownSeconds?: number;
    available?: boolean;
  };
  error?: {
    message?: string;
    waitSeconds?: number;
  };
};

function VibeTitle() {
  return (
    <>
      创建 <span className="text-[#6d35ff]">VibeLearning</span> 账号
    </>
  );
}

function validateField(name: FieldName, values: Record<FieldName, string>) {
  switch (name) {
    case "username":
      return values.username.trim() ? "" : "请输入账号名。";
    case "password":
      return values.password.length >= 6 ? "" : "密码至少需要 6 个字符，字母、数字、符号都可以。";
    case "confirmPassword":
      if (!values.confirmPassword) {
        return "请再次输入密码。";
      }
      return values.confirmPassword === values.password ? "" : "两次输入的密码不一致。";
    case "phoneNumber":
      return phonePattern.test(values.phoneNumber.trim()) ? "" : "请输入有效的 11 位手机号码。";
    case "email":
      return emailPattern.test(values.email.trim()) && values.email.trim().length <= 254 ? "" : "请输入有效的邮箱地址。";
    case "emailCode":
      return /^\d{4}$/.test(values.emailCode.trim()) ? "" : "请输入 4 位邮箱验证码。";
    default:
      return "";
  }
}

function FieldMessage({
  children,
  tone = "error"
}: {
  children?: ReactNode;
  tone?: "error" | "success" | "muted";
}) {
  if (!children) {
    return null;
  }

  return (
    <p
      className={cn(
        "mt-1.5 min-h-5 text-xs font-semibold",
        tone === "success" ? "text-emerald-600" : tone === "muted" ? "text-slate-500" : "text-red-600"
      )}
    >
      {children}
    </p>
  );
}

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
      className="grid min-h-[54px] grid-cols-[24px_1fr_auto] items-center gap-3 rounded-lg border border-[#cfd8ea] bg-white px-4 transition focus-within:border-[#6d35ff] focus-within:ring-2 focus-within:ring-[#6d35ff]/10"
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
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [email, setEmail] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [agreement, setAgreement] = useState(true);
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({});
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle");
  const [statusText, setStatusText] = useState(error || "");
  const [statusType, setStatusType] = useState<"error" | "success">(error ? "error" : "success");
  const [cooldown, setCooldown] = useState(0);
  const [sendingCode, setSendingCode] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const values = useMemo(
    () => ({ username, password, confirmPassword, phoneNumber, email, emailCode }),
    [confirmPassword, email, emailCode, password, phoneNumber, username]
  );

  useEffect(() => {
    if (cooldown <= 0) {
      return;
    }
    const timer = window.setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    if (!touched.username) {
      return;
    }

    const usernameValue = username.trim();
    if (!usernameValue) {
      setUsernameStatus("idle");
      return;
    }

    setUsernameStatus("checking");
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/auth/username/check?username=${encodeURIComponent(usernameValue)}`, {
          signal: controller.signal
        });
        const payload = (await response.json().catch(() => null)) as RegisterResponse | null;
        if (!response.ok || !payload?.ok) {
          setUsernameStatus("error");
          setFieldErrors((current) => ({
            ...current,
            username: payload?.error?.message || "账号名校验失败，请稍后再试。"
          }));
          return;
        }

        if (payload.data?.available) {
          setUsernameStatus("available");
          setFieldErrors((current) => ({ ...current, username: "" }));
        } else {
          setUsernameStatus("taken");
          setFieldErrors((current) => ({ ...current, username: "账号名已存在，请换一个。" }));
        }
      } catch (checkError) {
        if ((checkError as Error).name !== "AbortError") {
          setUsernameStatus("error");
          setFieldErrors((current) => ({ ...current, username: "账号名校验失败，请稍后再试。" }));
        }
      }
    }, 500);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [touched.username, username]);

  function showError(message: string) {
    setStatusType("error");
    setStatusText(message);
  }

  function showSuccess(message: string) {
    setStatusType("success");
    setStatusText(message);
  }

  function updateField(name: FieldName, value: string) {
    const nextValues = { ...values, [name]: value };
    if (name === "username") {
      setUsernameStatus("idle");
    }
    if (touched[name]) {
      setFieldErrors((current) => ({ ...current, [name]: validateField(name, nextValues) }));
    }
    if ((name === "password" || name === "confirmPassword") && (touched.password || touched.confirmPassword)) {
      setFieldErrors((current) => ({
        ...current,
        password: touched.password ? validateField("password", nextValues) : current.password,
        confirmPassword: touched.confirmPassword ? validateField("confirmPassword", nextValues) : current.confirmPassword
      }));
    }
  }

  function markTouched(name: FieldName) {
    setTouched((current) => ({ ...current, [name]: true }));
    setFieldErrors((current) => ({ ...current, [name]: validateField(name, values) }));
  }

  function validateAll() {
    const nextErrors: FieldErrors = {
      username: validateField("username", values),
      password: validateField("password", values),
      confirmPassword: validateField("confirmPassword", values),
      phoneNumber: validateField("phoneNumber", values),
      email: validateField("email", values),
      emailCode: validateField("emailCode", values)
    };
    setTouched({
      username: true,
      password: true,
      confirmPassword: true,
      phoneNumber: true,
      email: true,
      emailCode: true
    });
    setFieldErrors(nextErrors);
    return !Object.values(nextErrors).some(Boolean);
  }

  async function checkUsernameNow() {
    const usernameError = validateField("username", values);
    if (usernameError) {
      setFieldErrors((current) => ({ ...current, username: usernameError }));
      return false;
    }

    setUsernameStatus("checking");
    const response = await fetch(`/api/auth/username/check?username=${encodeURIComponent(username.trim())}`);
    const payload = (await response.json().catch(() => null)) as RegisterResponse | null;
    if (!response.ok || !payload?.ok || !payload.data?.available) {
      setUsernameStatus(payload?.data?.available === false ? "taken" : "error");
      setFieldErrors((current) => ({
        ...current,
        username: payload?.error?.message || "账号名已存在，请换一个。"
      }));
      return false;
    }

    setUsernameStatus("available");
    setFieldErrors((current) => ({ ...current, username: "" }));
    return true;
  }

  async function handleSendCode() {
    const emailError = validateField("email", values);
    setTouched((current) => ({ ...current, email: true }));
    setFieldErrors((current) => ({ ...current, email: emailError }));
    if (emailError) {
      showError(emailError);
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
    if (!validateAll()) {
      showError("请先修正表单里的提示。");
      return;
    }
    if (!(await checkUsernameNow())) {
      showError("请先更换可用的账号名。");
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
          username: username.trim(),
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
      <div className="flex min-h-[88px] items-center gap-5 bg-[#f4f6fa] px-8 py-4">
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

      <form className="mx-auto flex w-full max-w-[500px] flex-1 flex-col px-6 py-6 sm:px-10" noValidate onSubmit={handleSubmit}>
        <h1 className="whitespace-nowrap text-center text-[clamp(28px,3vw,38px)] font-black leading-tight text-[#292b52]">
          <VibeTitle />
        </h1>
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

        <div className="mt-8 grid gap-3">
          <div>
            <FieldShell
              htmlFor="username"
              icon={<UserRound className="text-slate-400" size={19} />}
            >
              <input
                autoComplete="username"
                className="min-w-0 border-none text-base outline-none placeholder:text-[#9aa4b7]"
                id="username"
                name="username"
                placeholder="账号名"
                required
                value={username}
                onBlur={() => markTouched("username")}
                onChange={(event) => {
                  setUsername(event.target.value);
                  updateField("username", event.target.value);
                }}
              />
              {usernameStatus === "available" ? <CheckCircle2 className="text-emerald-500" size={18} /> : null}
            </FieldShell>
            <FieldMessage tone={usernameStatus === "available" ? "success" : usernameStatus === "checking" ? "muted" : "error"}>
              {usernameStatus === "checking" ? "正在检查账号名..." : usernameStatus === "available" ? "账号名可用。" : fieldErrors.username}
            </FieldMessage>
          </div>

          <div>
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
                onBlur={() => markTouched("password")}
                onChange={(event) => {
                  setPassword(event.target.value);
                  updateField("password", event.target.value);
                }}
              />
            </FieldShell>
            <FieldMessage>{fieldErrors.password}</FieldMessage>
          </div>

          <div>
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
                onBlur={() => markTouched("confirmPassword")}
                onChange={(event) => {
                  setConfirmPassword(event.target.value);
                  updateField("confirmPassword", event.target.value);
                }}
              />
            </FieldShell>
            <FieldMessage>{fieldErrors.confirmPassword}</FieldMessage>
          </div>

          <div>
            <FieldShell htmlFor="phoneNumber" icon={<Smartphone className="text-slate-400" size={19} />}>
              <input
                autoComplete="tel"
                className="min-w-0 border-none text-base outline-none placeholder:text-[#9aa4b7]"
                id="phoneNumber"
                inputMode="numeric"
                maxLength={11}
                name="phoneNumber"
                placeholder="手机号码"
                required
                type="tel"
                value={phoneNumber}
                onBlur={() => markTouched("phoneNumber")}
                onChange={(event) => {
                  const nextValue = event.target.value.replace(/\D/g, "").slice(0, 11);
                  setPhoneNumber(nextValue);
                  updateField("phoneNumber", nextValue);
                }}
              />
            </FieldShell>
            <FieldMessage>{fieldErrors.phoneNumber}</FieldMessage>
          </div>

          <div>
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
                onBlur={() => markTouched("email")}
                onChange={(event) => {
                  setEmail(event.target.value);
                  updateField("email", event.target.value);
                }}
              />
            </FieldShell>
            <FieldMessage>{fieldErrors.email}</FieldMessage>
          </div>

          <div>
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
                onBlur={() => markTouched("emailCode")}
                onChange={(event) => {
                  const nextValue = event.target.value.replace(/\D/g, "").slice(0, 4);
                  setEmailCode(nextValue);
                  updateField("emailCode", nextValue);
                }}
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
            <FieldMessage>{fieldErrors.emailCode}</FieldMessage>
          </div>
        </div>

        <label className="mt-4 flex min-h-9 items-center gap-2 text-sm text-[#444b60]">
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
