import { revalidatePath } from "next/cache";
import { apiOk } from "@/lib/api-response";
import { repostBuddyPost } from "@/lib/buddy-posts";
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
    const repost = await repostBuddyPost(user.id, postId);
    revalidatePath("/buddy-circle");
    return apiOk({ post: repost });
  } catch (error) {
    return buddyApiError(error);
  }
}
