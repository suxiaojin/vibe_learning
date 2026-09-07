import { NextResponse } from "next/server";
import {
  hasResolvableEmailDomain,
  isValidEmail,
  normalizeEmail
} from "@/lib/email-verification";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function errorResponse(message: string, status: number, code: string) {
  return NextResponse.json({
    ok: false,
    error: { code, message }
  }, { status });
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

  try {
    if (!(await hasResolvableEmailDomain(email))) {
      return errorResponse("邮箱域名不存在或无法接收邮件，请检查后重试。", 400, "INVALID_EMAIL_DOMAIN");
    }
  } catch (error) {
    console.error("Failed to validate registration email domain", error);
    return errorResponse("暂时无法验证邮箱地址，请稍后再试。", 503, "EMAIL_DOMAIN_CHECK_FAILED");
  }

  return NextResponse.json({
    ok: true,
    data: { valid: true }
  });
}
