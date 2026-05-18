import { apiError, apiOk } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth";
import { getLearningQuestionsForStudent } from "@/lib/courses";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ pointId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return apiError("Authentication required.", 401, "UNAUTHORIZED");
  }

  const { pointId } = await params;
  const result = await getLearningQuestionsForStudent(user.id, pointId);

  if (!result) {
    return apiError("Knowledge point is unavailable.", 404, "LEARNING_POINT_NOT_FOUND");
  }

  return apiOk(result);
}
