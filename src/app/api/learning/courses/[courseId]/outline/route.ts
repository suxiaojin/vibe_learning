import { apiError, apiOk } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth";
import { getLearningCourseOutlineForStudent } from "@/lib/courses";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return apiError("Authentication required.", 401, "UNAUTHORIZED");
  }

  const { courseId } = await params;
  const outline = await getLearningCourseOutlineForStudent(user.id, courseId);

  if (!outline) {
    return apiError("Course is unavailable.", 404, "LEARNING_COURSE_NOT_FOUND");
  }

  return apiOk(outline);
}
