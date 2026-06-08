import { revalidatePath } from "next/cache";
import { apiOk } from "@/lib/api-response";
import { repostBuddyPost, unrepostBuddyPost } from "@/lib/buddy-posts";
import { buddyApiError, getStudentApiUser } from "@/lib/student-api";

export async function POST(
  request: Request,
  context: { params: Promise<{ postId: string }> }
) {
  const { user, response } = await getStudentApiUser();
  if (!user) {
    return response;
  }

  try {
    const { postId } = await context.params;
    const body = (await request.json().catch(() => null)) as { content?: string } | null;
    const repost = await repostBuddyPost(user.id, postId, typeof body?.content === "string" ? body.content : "");
    revalidatePath("/buddy-circle");
    revalidatePath("/me");
    return apiOk({ post: repost });
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
    await unrepostBuddyPost(user.id, postId);
    revalidatePath("/buddy-circle");
    revalidatePath("/me");
    return apiOk({ reposted: false });
  } catch (error) {
    return buddyApiError(error);
  }
}
