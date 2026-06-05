import { apiOk } from "@/lib/api-response";
import { listProfileBuddyPosts } from "@/lib/buddy-posts";
import { getPublicStudentProfile } from "@/lib/buddies";
import { buddyApiError, getStudentApiUser } from "@/lib/student-api";

export async function GET(
  request: Request,
  context: { params: Promise<{ userId: string }> }
) {
  const { user, response } = await getStudentApiUser();
  if (!user) {
    return response;
  }

  try {
    const { userId } = await context.params;
    const url = new URL(request.url);
    const profile = await getPublicStudentProfile(user.id, userId);
    const posts = profile.canViewPosts
      ? await listProfileBuddyPosts(user.id, userId, {
          cursor: url.searchParams.get("cursor") || undefined,
          limit: parseInteger(url.searchParams.get("limit"))
        })
      : { items: [], nextCursor: null };

    return apiOk({ profile, posts });
  } catch (error) {
    return buddyApiError(error);
  }
}

function parseInteger(value: string | null) {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}
