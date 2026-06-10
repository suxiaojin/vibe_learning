import type { Prisma } from "@prisma/client";

export const appStudentUserSelect = {
  id: true,
  username: true,
  email: true,
  phoneNumber: true,
  role: true,
  status: true,
  createdAt: true,
  lastLoginAt: true,
  studentProfile: {
    select: {
      nickname: true,
      avatarColor: true,
      avatarImage: true
    }
  }
} satisfies Prisma.UserSelect;

export type AppStudentUserRecord = Prisma.UserGetPayload<{ select: typeof appStudentUserSelect }>;

export function serializeAppStudentUser(user: AppStudentUserRecord) {
  const profile = user.studentProfile;

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    phoneNumber: user.phoneNumber,
    role: user.role,
    nickname: profile?.nickname || user.username,
    avatarColor: profile?.avatarColor || "green",
    avatarImage: profile?.avatarImage || "",
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null
  };
}
