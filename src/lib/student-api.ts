import { apiError } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth";
import { formatBuddyError } from "@/lib/buddies";

export async function getStudentApiUser() {
  const user = await getCurrentUser();
  if (!user) {
    return { user: null, response: apiError("Authentication required.", 401, "UNAUTHORIZED") };
  }
  if (user.role !== "student") {
    return { user: null, response: apiError("Student account required.", 403, "STUDENT_REQUIRED") };
  }
  return { user, response: null };
}

export function buddyApiError(error: unknown) {
  const buddyError = formatBuddyError(error);
  if (buddyError) {
    return apiError(buddyError.message, buddyError.status, buddyError.code);
  }
  throw error;
}
