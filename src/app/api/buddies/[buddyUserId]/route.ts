import { revalidatePath } from "next/cache";
import { apiOk } from "@/lib/api-response";
import { removeBuddy } from "@/lib/buddies";
import { buddyApiError, getStudentApiUser } from "@/lib/student-api";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ buddyUserId: string }> }
) {
  const { user, response } = await getStudentApiUser();
  if (!user) {
    return response;
  }

  try {
    const { buddyUserId } = await context.params;
    await removeBuddy(user.id, buddyUserId);
    revalidatePath("/me");
    revalidatePath("/buddy-circle");
    revalidatePath(`/students/${buddyUserId}`);
    return apiOk({ removed: true });
  } catch (error) {
    return buddyApiError(error);
  }
}
