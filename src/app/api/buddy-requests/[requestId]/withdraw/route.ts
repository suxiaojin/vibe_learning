import { revalidatePath } from "next/cache";
import { apiOk } from "@/lib/api-response";
import { withdrawBuddyRequest } from "@/lib/buddies";
import { buddyApiError, getStudentApiUser } from "@/lib/student-api";

export async function POST(
  _request: Request,
  context: { params: Promise<{ requestId: string }> }
) {
  const { user, response } = await getStudentApiUser();
  if (!user) {
    return response;
  }

  try {
    const { requestId } = await context.params;
    const buddyRequest = await withdrawBuddyRequest(user.id, requestId);
    revalidatePath("/me");
    revalidatePath("/notifications");
    revalidatePath(`/students/${buddyRequest.recipientId}`);
    return apiOk({ request: buddyRequest });
  } catch (error) {
    return buddyApiError(error);
  }
}
