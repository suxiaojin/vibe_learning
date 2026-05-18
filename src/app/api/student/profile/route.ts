import { z } from "zod";
import { apiError, apiOk } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth";
import {
  FoundationSelectionError,
  hasCompletedFoundationProfile,
  getStudentFoundationProfile,
  saveStudentFoundationProfile
} from "@/lib/foundation";

const profileSchema = z.object({
  regionId: z.string().min(1),
  publicSubjectId: z.string().min(1),
  majorId: z.string().min(1)
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return apiError("Authentication required.", 401, "UNAUTHORIZED");
  }

  const [profile, completed] = await Promise.all([
    getStudentFoundationProfile(user.id),
    hasCompletedFoundationProfile(user.id)
  ]);

  return apiOk({ profile, completed });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return apiError("Authentication required.", 401, "UNAUTHORIZED");
  }

  const body = await request.json().catch(() => null);
  const parsed = profileSchema.safeParse(body);

  if (!parsed.success) {
    return apiError("Invalid profile selection.", 400, "INVALID_PROFILE_SELECTION");
  }

  try {
    const profile = await saveStudentFoundationProfile(user.id, parsed.data);
    return apiOk({ profile, completed: true });
  } catch (error) {
    if (error instanceof FoundationSelectionError) {
      return apiError(error.message, error.status, "FOUNDATION_SELECTION_UNAVAILABLE");
    }
    throw error;
  }
}
