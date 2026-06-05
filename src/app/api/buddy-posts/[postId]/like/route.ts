import { revalidatePath } from "next/cache";
import { apiOk } from "@/lib/api-response";
import { likeBuddyPost, unlikeBuddyPost } from "@/lib/buddy-posts";
import { buddyApiError, getStudentApiUser } from "@/lib/student-api";

export async function POST(
  _request: Request,
  context: { params: Promise<{ postId: string }> }
) {
  const { user, response } = await getStudentApiUser();
  if (!user) {
    return response;
  }

  try {
    const { postId } = await context.params;
    const like = await likeBuddyPost(user.id, postId);
    revalidatePath("/buddy-circle");
    return apiOk({ like });
  } catch (error) {
    return buddyApiError(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ postId: string }> }
) {
  const { user, response } = await getStudentApiUser();
  if (!user) {
    return response;
  }

  try {
    const { postId } = await context.params;
    await unlikeBuddyPost(user.id, postId);
    revalidatePath("/buddy-circle");
    return apiOk({ liked: false });
  } catch (error) {
    return buddyApiError(error);
  }
}
