import { revalidatePath } from "next/cache";
import { apiOk } from "@/lib/api-response";
import { followUser, unfollowUser } from "@/lib/social";
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
    const follow = await followUser(user.id, userId);
    revalidatePath("/buddy-circle");
    revalidatePath(`/students/${userId}`);
    return apiOk({ follow });
  } catch (error) {
    return buddyApiError(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ userId: string }> }
) {
  const { user, response } = await getStudentApiUser();
  if (!user) {
    return response;
  }

  try {
    const { userId } = await context.params;
    await unfollowUser(user.id, userId);
    revalidatePath("/buddy-circle");
    revalidatePath(`/students/${userId}`);
    return apiOk({ following: false });
  } catch (error) {
    return buddyApiError(error);
  }
}
