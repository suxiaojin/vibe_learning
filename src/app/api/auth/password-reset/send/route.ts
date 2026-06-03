import { randomInt } from "crypto";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import {
  emailCodeCooldownMs,
  emailPurposePasswordReset,
  hashEmailCode,
  isValidEmail,
  normalizeEmail,
  sendPasswordResetMail
} from "@/lib/email-verification";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function errorResponse(message: string, status = 400, code = "PASSWORD_RESET_ERROR", data?: Record<string, unknown>) {
  return NextResponse.json(
    {
      ok: false,
      error: { code, message, ...data }
    },
    { status }
  );
}

function generateTemporaryPassword() {
  return randomInt(0, 1000000).toString().padStart(6, "0");
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
  const email = normalizeEmail(String(body?.email || ""));

  if (!isValidEmail(email)) {
    return errorResponse("请输入有效的邮箱地址。", 400, "INVALID_EMAIL");
  }

  const user = await prisma.user.findFirst({
    where: {
      OR: [{ username: email }, { email }]
    },
    select: {
      id: true,
      passwordHash: true,
      status: true
    }
  });

  if (!user) {
    return errorResponse("该邮箱未注册，请先注册", 404, "EMAIL_NOT_REGISTERED");
  }

  if (user.status === "disabled") {
    return errorResponse("该账号已被禁用，请联系管理员", 403, "ACCOUNT_DISABLED");
  }

  const now = new Date();
  const recentReset = await prisma.emailVerificationCode.findFirst({
    where: {
      email,
      purpose: emailPurposePasswordReset,
      lastSentAt: {
        gte: new Date(now.getTime() - emailCodeCooldownMs)
      }
    },
    orderBy: { lastSentAt: "desc" },
    select: { lastSentAt: true }
  });

  if (recentReset) {
    const waitSeconds = Math.max(1, Math.ceil((emailCodeCooldownMs - (now.getTime() - recentReset.lastSentAt.getTime())) / 1000));
    return errorResponse(`新密码已发送，请 ${waitSeconds} 秒后再试。`, 429, "PASSWORD_RESET_COOLDOWN", { waitSeconds });
  }

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, 12);
  const resetRecord = await prisma.emailVerificationCode.create({
    data: {
      email,
      purpose: emailPurposePasswordReset,
      codeHash: hashEmailCode(email, emailPurposePasswordReset, temporaryPassword),
      expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
      consumedAt: now,
      lastSentAt: now
    },
    select: { id: true }
  });

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash }
    });
  } catch (error) {
    await prisma.emailVerificationCode.delete({ where: { id: resetRecord.id } }).catch(() => undefined);
    console.error("Failed to set temporary password", error);
    return errorResponse("新密码生成失败，请稍后再试。", 500, "PASSWORD_RESET_FAILED");
  }

  try {
    await sendPasswordResetMail({
      email,
      password: temporaryPassword
    });
  } catch (error) {
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: user.passwordHash } }).catch((restoreError) => {
      console.error("Failed to restore password after reset email failure", restoreError);
    });
    await prisma.emailVerificationCode.delete({ where: { id: resetRecord.id } }).catch(() => undefined);
    console.error("Failed to send temporary password email", error);
    return errorResponse("新密码邮件发送失败，请稍后再试。", 502, "PASSWORD_RESET_SEND_FAILED");
  }

  await prisma.passwordChangeLog
    .create({
      data: {
        userId: user.id,
        source: "student_self",
        note: "邮箱找回密码"
      }
    })
    .catch((error) => {
      console.error("Failed to record password reset log", error);
    });

  return NextResponse.json({
    ok: true,
    data: {
      message: "新密码已发送，请查收邮箱。",
      cooldownSeconds: Math.round(emailCodeCooldownMs / 1000)
    }
  });
}
