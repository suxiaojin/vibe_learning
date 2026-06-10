import { apiError, apiOk } from "@/lib/api-response";
import { appStudentUserSelect, serializeAppStudentUser } from "@/lib/app-auth";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return apiError("Authentication required.", 401, "UNAUTHORIZED");
  }

  if (currentUser.role !== "student") {
    return apiError("App 仅支持学生账号。", 403, "STUDENT_REQUIRED");
  }

  const user = await prisma.user.findUnique({
    where: { id: currentUser.id },
    select: appStudentUserSelect
  });

  if (!user || user.status === "disabled") {
    return apiError("Authentication required.", 401, "UNAUTHORIZED");
  }

  return apiOk({
    user: serializeAppStudentUser(user)
  });
}
