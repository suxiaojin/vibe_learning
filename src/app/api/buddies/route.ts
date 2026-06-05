import { apiOk } from "@/lib/api-response";
import { getBuddyList } from "@/lib/buddies";
import { buddyApiError, getStudentApiUser } from "@/lib/student-api";

export async function GET() {
  const { user, response } = await getStudentApiUser();
  if (!user) {
    return response;
  }

  try {
    return apiOk({ buddies: await getBuddyList(user.id) });
  } catch (error) {
    return buddyApiError(error);
  }
}
