import { revalidatePath } from "next/cache";
import { apiError, apiOk } from "@/lib/api-response";
import { createBuddyPost, listBuddyFeed } from "@/lib/buddy-posts";
import { buddyApiError, getStudentApiUser } from "@/lib/student-api";

export async function GET(request: Request) {
  const { user, response } = await getStudentApiUser();
  if (!user) {
    return response;
  }

  try {
    const url = new URL(request.url);
    const result = await listBuddyFeed(user.id, {
      cursor: url.searchParams.get("cursor") || undefined,
      limit: parseInteger(url.searchParams.get("limit"))
    });
    return apiOk(result);
  } catch (error) {
    return buddyApiError(error);
  }
}

export async function POST(request: Request) {
  const { user, response } = await getStudentApiUser();
  if (!user) {
    return response;
  }

  try {
    const body = (await request.json().catch(() => null)) as { content?: string } | null;
    if (typeof body?.content !== "string") {
      return apiError("Missing content.", 400, "BUDDY_POST_CONTENT_REQUIRED");
    }
    const post = await createBuddyPost(user.id, body.content);
    revalidatePath("/buddy-circle");
    revalidatePath("/me");
    return apiOk({ post });
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
