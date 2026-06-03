import { NextResponse } from "next/server";
import {
  emailCodeCooldownMs,
  emailCodeExpiresMs,
  emailVerificationPurposeRegister,
  generateEmailCode,
  hashEmailCode,
  isValidEmail,
  normalizeEmail,
  sendEmailCodeMail
} from "@/lib/email-verification";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function errorResponse(message: string, status = 400, code = "EMAIL_CODE_ERROR", data?: Record<string, unknown>) {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code,
        message,
        ...data
      }
    },
    { status }
  );
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
  const email = normalizeEmail(String(body?.email || ""));

  if (!isValidEmail(email)) {
    return errorResponse("请输入有效的邮箱地址。", 400, "INVALID_EMAIL");
  }

  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [{ username: email }, { email }]
    },
    select: { id: true }
  });
  if (existingUser) {
    return errorResponse("该邮箱已注册，请直接登录。", 409, "EMAIL_ALREADY_REGISTERED");
  }

  const now = new Date();
  const recentCode = await prisma.emailVerificationCode.findFirst({
    where: {
      email,
      purpose: emailVerificationPurposeRegister,
      lastSentAt: {
        gte: new Date(now.getTime() - emailCodeCooldownMs)
      }
    },
    orderBy: { lastSentAt: "desc" },
    select: { lastSentAt: true }
  });

  if (recentCode) {
    const waitSeconds = Math.max(1, Math.ceil((emailCodeCooldownMs - (now.getTime() - recentCode.lastSentAt.getTime())) / 1000));
    return errorResponse(`验证码已发送，请 ${waitSeconds} 秒后再试。`, 429, "EMAIL_CODE_COOLDOWN", { waitSeconds });
  }

  const code = generateEmailCode();
  const verification = await prisma.emailVerificationCode.create({
    data: {
      email,
      purpose: emailVerificationPurposeRegister,
      codeHash: hashEmailCode(email, emailVerificationPurposeRegister, code),
      expiresAt: new Date(now.getTime() + emailCodeExpiresMs),
      lastSentAt: now
    },
    select: { id: true }
  });

  try {
    await sendEmailCodeMail({
      email,
      code,
      expiresInMinutes: Math.round(emailCodeExpiresMs / 1000 / 60)
    });
  } catch (error) {
    await prisma.emailVerificationCode.delete({ where: { id: verification.id } }).catch(() => undefined);
    console.error("Failed to send email verification code", error);
    return errorResponse("验证码邮件发送失败，请稍后再试。", 502, "EMAIL_CODE_SEND_FAILED");
  }

  await prisma.emailVerificationCode.updateMany({
    where: {
      email,
      purpose: emailVerificationPurposeRegister,
      id: { not: verification.id },
      consumedAt: null
    },
    data: { consumedAt: now }
  });

  return NextResponse.json({
    ok: true,
    data: {
      message: "验证码已发送，请查收邮箱。",
      expiresInSeconds: Math.round(emailCodeExpiresMs / 1000),
      cooldownSeconds: Math.round(emailCodeCooldownMs / 1000)
    }
  });
}
