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
const usernamePattern = /^[A-Za-z0-9]+$/;

type FieldName = "username" | "password" | "confirmPassword" | "phoneNumber" | "email" | "emailCode";
type FieldErrors = Partial<Record<FieldName, string>>;
type UsernameStatus = "idle" | "checking" | "available" | "taken" | "error";
type EmailValidationStatus = "idle" | "checking" | "valid" | "invalid" | "error";

type RegisterResponse = {
  ok: boolean;
  data?: {
    message?: string;
    redirectTo?: string;
    cooldownSeconds?: number;
    available?: boolean;
    valid?: boolean;
  };
  error?: {
    code?: string;
    message?: string;
    waitSeconds?: number;
  };
};

function registerErrorField(code?: string): FieldName | null {
  switch (code) {
    case "INVALID_USERNAME":
    case "INVALID_USERNAME_FORMAT":
    case "USERNAME_ALREADY_REGISTERED":
      return "username";
    case "INVALID_PASSWORD":
      return "password";
    case "PASSWORD_MISMATCH":
      return "confirmPassword";
    case "INVALID_PHONE_NUMBER":
      return "phoneNumber";
    case "INVALID_EMAIL":
    case "INVALID_EMAIL_DOMAIN":
    case "EMAIL_ALREADY_REGISTERED":
      return "email";
    case "INVALID_EMAIL_CODE_FORMAT":
    case "EMAIL_CODE_EXPIRED":
    case "EMAIL_CODE_INVALID":
    case "EMAIL_CODE_CONSUMED":
    case "EMAIL_CODE_ATTEMPTS_EXCEEDED":
      return "emailCode";
    default:
      return null;
  }
}

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
      if (!values.username.trim()) {
        return "请输入账号名。";
      }
      return usernamePattern.test(values.username.trim()) ? "" : "账号名只能使用英文字母和数字。";
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
  const [emailValidationStatus, setEmailValidationStatus] = useState<EmailValidationStatus>("idle");
  const [validatedEmail, setValidatedEmail] = useState("");
  const [agreementError, setAgreementError] = useState("");
  const [statusText, setStatusText] = useState(error || "");
  const [statusType, setStatusType] = useState<"error" | "success">(error ? "error" : "success");
  const [cooldown, setCooldown] = useState(0);
  const [sendingCode, setSendingCode] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const values = useMemo(
    () => ({ username, password, confirmPassword, phoneNumber, email, emailCode }),
    [confirmPassword, email, emailCode, password, phoneNumber, username]
  );
  const emailFormatError = validateField("email", values);
  const normalizedEmail = email.trim().toLowerCase();
  const emailReady = emailValidationStatus === "valid" && validatedEmail === normalizedEmail;

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
    if (!usernamePattern.test(usernameValue)) {
      setUsernameStatus("idle");
      setFieldErrors((current) => ({ ...current, username: "账号名只能使用英文字母和数字。" }));
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

  useEffect(() => {
    if (emailFormatError) {
      setEmailValidationStatus("idle");
      setValidatedEmail("");
      return;
    }

    const emailValue = normalizedEmail;
    setEmailValidationStatus("checking");
    setValidatedEmail("");
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/auth/email/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({ email: emailValue })
        });
        const payload = (await response.json().catch(() => null)) as RegisterResponse | null;
        if (controller.signal.aborted) {
          return;
        }

        if (!response.ok || !payload?.ok || !payload.data?.valid) {
          setEmailValidationStatus(payload?.error?.code === "EMAIL_DOMAIN_CHECK_FAILED" ? "error" : "invalid");
          setTouched((current) => ({ ...current, email: true }));
          setFieldErrors((current) => ({
            ...current,
            email: payload?.error?.message || "邮箱地址验证失败，请检查后重试。"
          }));
          setStatusText("");
          return;
        }

        setEmailValidationStatus("valid");
        setValidatedEmail(emailValue);
        setFieldErrors((current) => ({ ...current, email: "" }));
      } catch (checkError) {
        if ((checkError as Error).name !== "AbortError") {
          setEmailValidationStatus("error");
          setTouched((current) => ({ ...current, email: true }));
          setFieldErrors((current) => ({ ...current, email: "邮箱地址验证失败，请检查网络后重试。" }));
          setStatusText("");
        }
      }
    }, 500);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [emailFormatError, normalizedEmail]);

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
      return;
    }
    if (!emailReady) {
      setFieldErrors((current) => ({ ...current, email: "请等待邮箱地址验证完成。" }));
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
        const errorMessage = payload?.error?.message || "验证码发送失败，请稍后再试。";
        if (typeof waitSeconds === "number") {
          setCooldown(waitSeconds);
        }
        const errorField = payload?.error?.code === "INVALID_EMAIL"
          || payload?.error?.code === "INVALID_EMAIL_DOMAIN"
          || payload?.error?.code === "EMAIL_ALREADY_REGISTERED"
          || payload?.error?.code === "EMAIL_DOMAIN_CHECK_FAILED"
          ? "email"
          : "emailCode";
        setTouched((current) => ({ ...current, [errorField]: true }));
        setFieldErrors((current) => ({ ...current, [errorField]: errorMessage }));
        setStatusText("");
        return;
      }

      setCooldown(payload.data?.cooldownSeconds || 60);
      setFieldErrors((current) => ({ ...current, emailCode: "" }));
      showSuccess(payload.data?.message || "验证码已发送，请查收邮箱。");
    } catch {
      setTouched((current) => ({ ...current, emailCode: true }));
      setFieldErrors((current) => ({ ...current, emailCode: "验证码发送失败，请检查网络后重试。" }));
      setStatusText("");
    } finally {
      setSendingCode(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validateAll()) {
      setStatusText("");
      return;
    }
    if (!(await checkUsernameNow())) {
      setStatusText("");
      return;
    }
    if (!agreement) {
      setAgreementError("请先同意平台使用协议和隐私政策。");
      setStatusText("");
      return;
    }
    setAgreementError("");

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
        const errorMessage = payload?.error?.message || "注册失败，请稍后再试。";
        const errorField = registerErrorField(payload?.error?.code);
        if (errorField) {
          setTouched((current) => ({ ...current, [errorField]: true }));
          setFieldErrors((current) => ({ ...current, [errorField]: errorMessage }));
          setStatusText("");
        } else if (payload?.error?.code === "AGREEMENT_REQUIRED") {
          setAgreementError(errorMessage);
          setStatusText("");
        } else {
          showError(errorMessage);
        }
        return;
      }

      showSuccess(payload.data?.message || "注册成功，正在进入系统。");
      window.setTimeout(() => router.replace(payload.data?.redirectTo || "/learn"), 1200);
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
        {statusText && statusType === "success" ? (
          <p className="mt-5 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
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
                pattern="[A-Za-z0-9]+"
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
            <FieldMessage tone={emailValidationStatus === "checking" ? "muted" : emailReady ? "success" : "error"}>
              {emailValidationStatus === "checking"
                ? "正在验证邮箱地址..."
                : emailReady
                  ? "邮箱地址可用。"
                  : fieldErrors.email}
            </FieldMessage>
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
                disabled={sendingCode || cooldown > 0 || !emailReady}
                type="button"
                onClick={handleSendCode}
              >
                {cooldown > 0 ? `${cooldown}s` : sendingCode ? "发送中" : emailValidationStatus === "checking" ? "验证中" : "获取验证码"}
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
            onChange={(event) => {
              setAgreement(event.target.checked);
              if (event.target.checked) {
                setAgreementError("");
              }
            }}
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
        <FieldMessage>{agreementError}</FieldMessage>

        {statusText && statusType === "error" ? (
          <p className="mt-2 text-sm font-semibold text-red-600" role="alert">{statusText}</p>
        ) : null}

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
