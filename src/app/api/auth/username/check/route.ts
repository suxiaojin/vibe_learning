import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const usernamePattern = /^[A-Za-z0-9]+$/;

function errorResponse(message: string, status = 400, code = "USERNAME_CHECK_ERROR") {
  return NextResponse.json(
    {
      ok: false,
      error: { code, message }
    },
    { status }
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const username = String(searchParams.get("username") || "").trim();

  if (!username) {
    return errorResponse("请输入账号名。", 400, "INVALID_USERNAME");
  }
  if (!usernamePattern.test(username)) {
    return errorResponse("账号名只能使用英文字母和数字。", 400, "INVALID_USERNAME_FORMAT");
  }

  const exists = await prisma.user.findUnique({
    where: { username },
    select: { id: true }
  });

  return NextResponse.json({
    ok: true,
    data: {
      available: !exists
    }
  });
}
