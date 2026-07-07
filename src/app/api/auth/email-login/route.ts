import { NextResponse } from "next/server";
import {
  emailCodeMaxAttempts,
  emailVerificationPurposeLogin,
  hashEmailCode,
  isValidEmail,
  normalizeEmail
} from "@/lib/email-verification";
import type { UserRole } from "@prisma/client";
import { createSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const emailCodePattern = /^\d{4}$/;

function errorResponse(message: string, status = 400, code = "EMAIL_LOGIN_ERROR") {
  return NextResponse.json(
    {
      ok: false,
      error: { code, message }
    },
    { status }
  );
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    email?: unknown;
    emailCode?: unknown;
    agreement?: unknown;
  } | null;

  const email = normalizeEmail(String(body?.email || ""));
  const emailCode = String(body?.emailCode || "").trim();

  if (!isValidEmail(email)) {
    return errorResponse("请输入有效的邮箱地址。", 400, "INVALID_EMAIL");
  }

  if (!emailCodePattern.test(emailCode)) {
    return errorResponse("请输入 4 位邮箱验证码。", 400, "INVALID_EMAIL_CODE_FORMAT");
  }

  if (body?.agreement !== true) {
    return errorResponse("请先同意用户协议和隐私政策。", 400, "AGREEMENT_REQUIRED");
  }

  const user = await prisma.user.findFirst({
    where: {
      OR: [{ username: email }, { email }]
    },
    select: {
      id: true,
      username: true,
      role: true,
      status: true
    }
  });

  if (!user) {
    return errorResponse("该邮箱还未注册，请先注册。", 404, "EMAIL_NOT_REGISTERED");
  }

  if (user.status === "disabled") {
    return errorResponse("账号已被禁用，请联系管理员。", 403, "ACCOUNT_DISABLED");
  }

  if (user.role !== "student") {
    return errorResponse("管理员账号请使用后台登录入口。", 403, "ADMIN_LOGIN_REQUIRED");
  }

  const now = new Date();
  const verification = await prisma.emailVerificationCode.findFirst({
    where: {
      email,
      purpose: emailVerificationPurposeLogin,
      consumedAt: null,
      expiresAt: { gt: now }
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      codeHash: true,
      attemptCount: true
    }
  });

  if (!verification) {
    return errorResponse("邮箱验证码不存在或已过期，请重新获取。", 400, "EMAIL_CODE_EXPIRED");
  }

  if (verification.attemptCount >= emailCodeMaxAttempts) {
    return errorResponse("验证码错误次数过多，请重新获取验证码。", 429, "EMAIL_CODE_ATTEMPTS_EXCEEDED");
  }

  const expectedHash = hashEmailCode(email, emailVerificationPurposeLogin, emailCode);
  if (verification.codeHash !== expectedHash) {
    await prisma.emailVerificationCode.update({
      where: { id: verification.id },
      data: { attemptCount: { increment: 1 } }
    });
    return errorResponse("邮箱验证码不正确。", 400, "EMAIL_CODE_INVALID");
  }

  let loggedInUser: { id: string; username: string; role: UserRole } | null = null;
  try {
    loggedInUser = await prisma.$transaction(async (tx) => {
      const consumed = await tx.emailVerificationCode.updateMany({
        where: {
          id: verification.id,
          consumedAt: null
        },
        data: {
          consumedAt: new Date(),
          attemptCount: { increment: 1 }
        }
      });
      if (consumed.count !== 1) {
        throw new Error("EMAIL_CODE_CONSUMED");
      }

      return tx.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
        select: {
          id: true,
          username: true,
          role: true
        }
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "EMAIL_CODE_CONSUMED") {
      return errorResponse("邮箱验证码已使用，请重新获取。", 400, "EMAIL_CODE_CONSUMED");
    }

    console.error("Failed to log in with email code", error);
    return errorResponse("登录失败，请稍后再试。", 500, "EMAIL_LOGIN_FAILED");
  }

  if (!loggedInUser) {
    return errorResponse("邮箱验证码已使用，请重新获取。", 400, "EMAIL_CODE_CONSUMED");
  }

  await createSession(loggedInUser);

  return NextResponse.json({
    ok: true,
    data: {
      message: "登录成功",
      redirectTo: "/learn"
    }
  });
}
