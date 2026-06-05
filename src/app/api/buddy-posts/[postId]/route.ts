import { revalidatePath } from "next/cache";
import { apiOk } from "@/lib/api-response";
import { deleteBuddyPost } from "@/lib/buddy-posts";
import { buddyApiError, getStudentApiUser } from "@/lib/student-api";

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
    await deleteBuddyPost(user.id, postId);
    revalidatePath("/buddy-circle");
    revalidatePath("/me");
    return apiOk({ deleted: true });
  } catch (error) {
    return buddyApiError(error);
  }
}
