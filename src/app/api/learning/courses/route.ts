import { apiError, apiOk } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth";
import { getAvailableLearningCoursesForStudent } from "@/lib/courses";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return apiError("Authentication required.", 401, "UNAUTHORIZED");
  }

  const courses = await getAvailableLearningCoursesForStudent(user.id);
  return apiOk({ courses });
}
