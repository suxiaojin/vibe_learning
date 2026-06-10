import bcrypt from "bcryptjs";
import { apiError, apiOk } from "@/lib/api-response";
import { appStudentUserSelect, serializeAppStudentUser } from "@/lib/app-auth";
import { createSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type AppLoginPayload = {
  username?: unknown;
  password?: unknown;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as AppLoginPayload | null;
  const username = String(body?.username || "").trim();
  const password = String(body?.password || "");

  if (!username || !password) {
    return apiError("请输入账号和密码。", 400, "INVALID_APP_LOGIN_PAYLOAD");
  }

  const user = await prisma.user.findFirst({
    where: {
      OR: [{ username }, { email: username.toLowerCase() }]
    },
    select: {
      ...appStudentUserSelect,
      passwordHash: true
    }
  });

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return apiError("账号或密码错误。", 401, "INVALID_CREDENTIALS");
  }

  if (user.status === "disabled") {
    return apiError("账号已被禁用，请联系管理员。", 403, "ACCOUNT_DISABLED");
  }

  if (user.role !== "student") {
    return apiError("App 仅支持学生账号登录。", 403, "STUDENT_REQUIRED");
  }

  const loggedInUser = await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
    select: appStudentUserSelect
  });

  await createSession(loggedInUser);

  return apiOk({
    user: serializeAppStudentUser(loggedInUser),
    session: {
      cookieName: "vl_session",
      expiresInSeconds: 60 * 60 * 24 * 14
    }
  });
}
