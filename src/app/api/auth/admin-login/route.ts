import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createAdminSession } from "@/lib/auth";

function redirectTo(request: Request, path: string) {
  const origin =
    request.headers.get("origin") ||
    process.env.NEXT_PUBLIC_ADMIN_APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000";
  return NextResponse.redirect(new URL(path, origin), 303);
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "");

  const user = await prisma.user.findFirst({
    where: {
      OR: [{ username }, { email: username.toLowerCase() }]
    }
  });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return redirectTo(request, "/admin/login?error=Invalid%20username%20or%20password");
  }

  if (user.status === "disabled") {
    return redirectTo(request, "/admin/login?error=Account%20disabled");
  }

  if (user.role !== "admin") {
    return redirectTo(request, "/admin/login?error=Admin%20account%20required");
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await createAdminSession(user);

  return redirectTo(request, "/admin");
}
