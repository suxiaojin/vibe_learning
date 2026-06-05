import { revalidatePath } from "next/cache";
import { apiError, apiOk } from "@/lib/api-response";
import { createBuddyRequest } from "@/lib/buddies";
import { buddyApiError, getStudentApiUser } from "@/lib/student-api";

export async function POST(request: Request) {
  const { user, response } = await getStudentApiUser();
  if (!user) {
    return response;
  }

  try {
    const body = (await request.json().catch(() => null)) as { recipientId?: string } | null;
    const recipientId = body?.recipientId?.trim();
    if (!recipientId) {
      return apiError("Missing recipientId.", 400, "BUDDY_RECIPIENT_REQUIRED");
    }
    const buddyRequest = await createBuddyRequest(user.id, recipientId);
    revalidatePath("/me");
    revalidatePath(`/students/${recipientId}`);
    return apiOk({ request: buddyRequest });
  } catch (error) {
    return buddyApiError(error);
  }
}
