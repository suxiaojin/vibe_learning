import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  emailCodeMaxAttempts,
  emailVerificationPurposeRegister,
  hashEmailCode,
  isValidEmail,
  normalizeEmail
} from "@/lib/email-verification";
import { grantRegisterDiamondBonus } from "@/lib/rewards";

export const runtime = "nodejs";

type RegisterPayload = {
  phoneNumber: string;
  email: string;
  emailCode: string;
  password: string;
  confirmPassword: string;
  agreement: boolean;
};

const phonePattern = /^1[3-9]\d{9}$/;
const emailCodePattern = /^\d{4}$/;

function errorResponse(message: string, status = 400, code = "REGISTER_ERROR") {
  return NextResponse.json(
    {
      ok: false,
      error: { code, message }
    },
    { status }
  );
}

async function parsePayload(request: Request): Promise<RegisterPayload | null> {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as Partial<Record<keyof RegisterPayload, unknown>> | null;
    if (!body) {
      return null;
    }
    return {
      phoneNumber: String(body.phoneNumber || "").trim(),
      email: String(body.email || ""),
      emailCode: String(body.emailCode || "").trim(),
      password: String(body.password || ""),
      confirmPassword: String(body.confirmPassword || ""),
      agreement: body.agreement === true
    };
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return null;
  }
  return {
    phoneNumber: String(formData.get("phoneNumber") || "").trim(),
    email: String(formData.get("email") || ""),
    emailCode: String(formData.get("emailCode") || "").trim(),
    password: String(formData.get("password") || ""),
    confirmPassword: String(formData.get("confirmPassword") || ""),
    agreement: formData.get("agreement") === "on"
  };
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function POST(request: Request) {
  const payload = await parsePayload(request);
  if (!payload) {
    return errorResponse("注册信息格式不正确。", 400, "INVALID_REGISTER_PAYLOAD");
  }

  const phoneNumber = payload.phoneNumber;
  const email = normalizeEmail(payload.email);
  const emailCode = payload.emailCode;
  const password = payload.password;
  const confirmPassword = payload.confirmPassword;

  if (!phonePattern.test(phoneNumber)) {
    return errorResponse("请输入有效的 11 位手机号码。", 400, "INVALID_PHONE_NUMBER");
  }

  if (!isValidEmail(email)) {
    return errorResponse("请输入有效的邮箱地址。", 400, "INVALID_EMAIL");
  }

  if (!emailCodePattern.test(emailCode)) {
    return errorResponse("请输入 4 位邮箱验证码。", 400, "INVALID_EMAIL_CODE_FORMAT");
  }

  if (password.length < 6) {
    return errorResponse("密码至少需要 6 个字符。", 400, "INVALID_PASSWORD");
  }

  if (password !== confirmPassword) {
    return errorResponse("两次输入的密码不一致。", 400, "PASSWORD_MISMATCH");
  }

  if (!payload.agreement) {
    return errorResponse("请先同意平台使用协议和隐私政策。", 400, "AGREEMENT_REQUIRED");
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
  const verification = await prisma.emailVerificationCode.findFirst({
    where: {
      email,
      purpose: emailVerificationPurposeRegister,
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

  const expectedHash = hashEmailCode(email, emailVerificationPurposeRegister, emailCode);
  if (verification.codeHash !== expectedHash) {
    await prisma.emailVerificationCode.update({
      where: { id: verification.id },
      data: { attemptCount: { increment: 1 } }
    });
    return errorResponse("邮箱验证码不正确。", 400, "EMAIL_CODE_INVALID");
  }

  const passwordHash = await bcrypt.hash(password, 12);

  try {
    await prisma.$transaction(async (tx) => {
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

      const duplicate = await tx.user.findFirst({
        where: {
          OR: [{ username: email }, { email }]
        },
        select: { id: true }
      });
      if (duplicate) {
        throw new Error("EMAIL_ALREADY_EXISTS");
      }

      const created = await tx.user.create({
        data: {
          username: email,
          passwordHash,
          role: "student",
          phoneNumber,
          email,
          studentProfile: {
            create: {
              nickname: email
            }
          }
        }
      });

      await grantRegisterDiamondBonus(tx, created.id);
    });

    return NextResponse.json({
      ok: true,
      data: {
        message: "恭喜！注册成功",
        redirectTo: "/login"
      }
    });
  } catch (error) {
    if (isUniqueConstraintError(error) || (error instanceof Error && error.message === "EMAIL_ALREADY_EXISTS")) {
      return errorResponse("该邮箱已注册，请直接登录。", 409, "EMAIL_ALREADY_REGISTERED");
    }
    if (error instanceof Error && error.message === "EMAIL_CODE_CONSUMED") {
      return errorResponse("邮箱验证码已使用，请重新获取。", 400, "EMAIL_CODE_CONSUMED");
    }

    console.error("Failed to register student", error);
    return errorResponse("注册失败，请稍后再试。", 500, "REGISTER_FAILED");
  }
}
