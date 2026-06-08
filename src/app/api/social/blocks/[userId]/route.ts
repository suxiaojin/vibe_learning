import { revalidatePath } from "next/cache";
import { apiOk } from "@/lib/api-response";
import { blockUser } from "@/lib/social";
import { buddyApiError, getStudentApiUser } from "@/lib/student-api";

export async function POST(
  _request: Request,
  context: { params: Promise<{ userId: string }> }
) {
  const { user, response } = await getStudentApiUser();
  if (!user) {
    return response;
  }

  try {
    const { userId } = await context.params;
    const block = await blockUser(user.id, userId);
    revalidatePath("/buddy-circle");
    revalidatePath(`/students/${userId}`);
    return apiOk({ block });
  } catch (error) {
    return buddyApiError(error);
  }
}
