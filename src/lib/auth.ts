import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordDailyActiveDiamondBonus } from "@/lib/rewards";

const studentCookieName = "vl_session";
const adminCookieName = "vl_admin_session";
const sessionMaxAgeSeconds = 60 * 60 * 24 * 14;
const activityUpdateIntervalMs = 60 * 1000;

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 24) {
    throw new Error("AUTH_SECRET must be at least 24 characters.");
  }
  return new TextEncoder().encode(secret);
}

async function createSessionCookie(user: { id: string; username: string; role: UserRole }, cookieName: string) {
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
    maxAge: sessionMaxAgeSeconds
  });
}

export async function createSession(user: { id: string; username: string; role: UserRole }) {
  if (user.role !== "student") {
    throw new Error("createSession only supports student users.");
  }
  await createSessionCookie(user, studentCookieName);
}

export async function createAdminSession(user: { id: string; username: string; role: UserRole }) {
  if (user.role !== "admin") {
    throw new Error("createAdminSession only supports admin users.");
  }
  await createSessionCookie(user, adminCookieName);
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(studentCookieName);
}

export async function clearAdminSession() {
  const cookieStore = await cookies();
  cookieStore.delete(adminCookieName);
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

async function getUserFromSession(cookieName: string) {
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

    return user;
  } catch {
    return null;
  }
}

export async function getCurrentUser() {
  const user = await getUserFromSession(studentCookieName);
  if (!user || user.role !== "student") {
    return null;
  }

  try {
    await recordUserActivity(user);
    await recordDailyActiveDiamondBonus(user.id);
  } catch (error) {
    console.error("Failed to record student activity", error);
  }

  return user;
}

export async function getCurrentAdmin() {
  const user = await getUserFromSession(adminCookieName);
  return user?.role === "admin" ? user : null;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

export async function requireAdmin() {
  const user = await getCurrentAdmin();
  if (!user) {
    redirect("/admin/login");
  }
  return user;
}
