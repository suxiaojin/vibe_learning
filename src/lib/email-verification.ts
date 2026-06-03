import { createHmac, randomInt } from "crypto";

export const emailVerificationPurposeRegister = "register";
export const emailCodeExpiresMs = 10 * 60 * 1000;
export const emailCodeCooldownMs = 60 * 1000;
export const emailCodeMaxAttempts = 5;

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

function getEmailCodeServiceUrl() {
  return (process.env.EMAIL_CODE_SERVICE_URL || "http://172.18.255.14:8002").replace(/\/+$/, "");
}

export async function sendEmailCodeMail(input: { email: string; code: string; expiresInMinutes: number }) {
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

    const response = await fetch(`${getEmailCodeServiceUrl()}/send-email-code`, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        email: input.email,
        code: input.code,
        purpose: emailVerificationPurposeRegister,
        expiresInMinutes: input.expiresInMinutes
      })
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Email service failed with ${response.status}: ${detail.slice(0, 500)}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}
