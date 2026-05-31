import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/auth";
import { grantRegisterDiamondBonus } from "@/lib/rewards";

function redirectTo(request: Request, path: string) {
  const origin = request.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return NextResponse.redirect(new URL(path, origin), 303);
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "");

  if (username.length < 3 || password.length < 6) {
    return redirectTo(request, "/register?error=Username%20must%20be%203%2B%20chars%20and%20password%206%2B%20chars");
  }

  const exists = await prisma.user.findUnique({ where: { username } });
  if (exists) {
    return redirectTo(request, "/register?error=Username%20already%20exists");
  }

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        username,
        passwordHash: await bcrypt.hash(password, 12),
        role: "student",
        studentProfile: {
          create: {
            nickname: username
          }
        }
      }
    });

    await grantRegisterDiamondBonus(tx, created.id);
    return created;
  });
  await createSession(user);

  return redirectTo(request, "/learn");
}
