import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordDailyActiveDiamondBonus } from "@/lib/rewards";

const cookieName = "vl_session";
const activityUpdateIntervalMs = 60 * 1000;

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 24) {
    throw new Error("AUTH_SECRET must be at least 24 characters.");
  }
  return new TextEncoder().encode(secret);
}

export async function createSession(user: { id: string; username: string; role: UserRole }) {
  const token = await new SignJWT({
    sub: user.id,
    username: user.username,
    role: user.role
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("14d")
    .sign(getSecret());

  const cookieStore = await cookies();
  cookieStore.set(cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: 60 * 60 * 24 * 14
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(cookieName);
}

async function recordUserActivity(user: { id: string; lastActiveAt: Date | null }) {
  const now = new Date();
  if (user.lastActiveAt && now.getTime() - user.lastActiveAt.getTime() < activityUpdateIntervalMs) {
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastActiveAt: now }
  });
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value;
  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (!payload.sub) {
      return null;
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        username: true,
        role: true,
        status: true,
        createdAt: true,
        lastLoginAt: true,
        lastActiveAt: true
      }
    });

    if (user?.status === "disabled") {
      return null;
    }

    if (user?.role === "student") {
      try {
        await recordUserActivity(user);
        await recordDailyActiveDiamondBonus(user.id);
      } catch (error) {
        console.error("Failed to record student activity", error);
      }
    }

    return user;
  } catch {
    return null;
  }
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "admin") {
    redirect("/learn");
  }
  return user;
}
