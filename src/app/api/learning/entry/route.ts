import { apiError, apiOk } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth";
import { getLearningEntryStatus } from "@/lib/learning";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return apiError("Authentication required.", 401, "UNAUTHORIZED");
  }

  const entryStatus = await getLearningEntryStatus(user.id);
  return apiOk(entryStatus);
}
