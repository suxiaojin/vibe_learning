import { createHmac, randomInt } from "crypto";

export const emailVerificationPurposeRegister = "register";
export const emailVerificationPurposeLogin = "login";
export const emailPurposePasswordReset = "password_reset";
export const emailCodeExpiresMs = 10 * 60 * 1000;
export const emailCodeCooldownMs = 60 * 1000;
export const emailCodeMaxAttempts = 5;

export const emailVerificationPurposes = [emailVerificationPurposeRegister, emailVerificationPurposeLogin] as const;
export type EmailVerificationPurpose = (typeof emailVerificationPurposes)[number];
export type EmailMailPurpose = EmailVerificationPurpose | typeof emailPurposePasswordReset;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string) {
  return emailPattern.test(value) && value.length <= 254;
}

export function generateEmailCode() {
  return randomInt(0, 10000).toString().padStart(4, "0");
}

function getEmailCodeSecret() {
  const secret = process.env.EMAIL_CODE_SECRET || process.env.AUTH_SECRET;
  if (!secret || secret.length < 24) {
    throw new Error("EMAIL_CODE_SECRET or AUTH_SECRET must be at least 24 characters.");
  }
  return secret;
}

export function hashEmailCode(email: string, purpose: string, code: string) {
  return createHmac("sha256", getEmailCodeSecret()).update(`${purpose}:${email}:${code}`).digest("hex");
}

export function isEmailVerificationPurpose(value: unknown): value is EmailVerificationPurpose {
  return typeof value === "string" && emailVerificationPurposes.includes(value as EmailVerificationPurpose);
}

function getEmailCodeServiceUrl() {
  return (process.env.EMAIL_CODE_SERVICE_URL || "http://172.18.255.14:8002").replace(/\/+$/, "");
}

async function postEmailService(path: string, payload: Record<string, unknown>) {
  const controller = new AbortController();
  const timeoutMs = Number(process.env.EMAIL_CODE_SERVICE_TIMEOUT_MS || 10000);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };
    const token = process.env.EMAIL_CODE_SERVICE_TOKEN;
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${getEmailCodeServiceUrl()}${path}`, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Email service failed with ${response.status}: ${detail.slice(0, 500)}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function sendEmailMail(input: { email: string; code: string; purpose: EmailMailPurpose; expiresInMinutes: number }) {
  return postEmailService("/send-email-code", {
    email: input.email,
    code: input.code,
    purpose: input.purpose,
    expiresInMinutes: input.expiresInMinutes
  });
}

export async function sendEmailCodeMail(input: { email: string; code: string; purpose: EmailVerificationPurpose; expiresInMinutes: number }) {
  return sendEmailMail(input);
}

export async function sendPasswordResetMail(input: { email: string; password: string }) {
  return sendEmailMail({
    email: input.email,
    code: input.password,
    purpose: emailPurposePasswordReset,
    expiresInMinutes: 0
  });
}

export async function sendNotificationEmail(input: { email: string; subject: string; html: string }) {
  const email = normalizeEmail(input.email);
  if (!isValidEmail(email)) {
    throw new Error(`Invalid recipient email: ${input.email}`);
  }

  const subject = input.subject.trim().slice(0, 120);
  if (!subject) {
    throw new Error("Email subject is required.");
  }

  return postEmailService("/send-email", {
    email,
    subject,
    html: input.html
  });
}
