import { apiError, apiOk } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth";
import { getLearningKnowledgePointForStudent } from "@/lib/courses";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ pointId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return apiError("Authentication required.", 401, "UNAUTHORIZED");
  }

  const { pointId } = await params;
  const point = await getLearningKnowledgePointForStudent(user.id, pointId);

  if (!point) {
    return apiError("Knowledge point is unavailable.", 404, "LEARNING_POINT_NOT_FOUND");
  }

  return apiOk({ point });
}
