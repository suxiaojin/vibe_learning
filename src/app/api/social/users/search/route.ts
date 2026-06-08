import { apiOk } from "@/lib/api-response";
import { searchUsersByNickname } from "@/lib/social";
import { buddyApiError, getStudentApiUser } from "@/lib/student-api";

export async function GET(request: Request) {
  const { user, response } = await getStudentApiUser();
  if (!user) {
    return response;
  }

  try {
    const url = new URL(request.url);
    return apiOk(await searchUsersByNickname(user.id, url.searchParams.get("q") || "", {
      limit: parseInteger(url.searchParams.get("limit"))
    }));
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
