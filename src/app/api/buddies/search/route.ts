import { apiOk } from "@/lib/api-response";
import { searchBuddyCandidates, type BuddySearchFilters } from "@/lib/buddies";
import { buddyApiError, getStudentApiUser } from "@/lib/student-api";

export async function GET(request: Request) {
  const { user, response } = await getStudentApiUser();
  if (!user) {
    return response;
  }

  try {
    const url = new URL(request.url);
    const filters: BuddySearchFilters = {
      birthYear: parseInteger(url.searchParams.get("birthYear")),
      birthMonth: parseInteger(url.searchParams.get("birthMonth")),
      gender: parseGender(url.searchParams.get("gender")),
      schoolId: stringParam(url.searchParams.get("schoolId")),
      majorId: stringParam(url.searchParams.get("majorId")),
      province: stringParam(url.searchParams.get("province")),
      studySystem: stringParam(url.searchParams.get("studySystem")),
      cursor: stringParam(url.searchParams.get("cursor")),
      limit: parseInteger(url.searchParams.get("limit"))
    };
    return apiOk(await searchBuddyCandidates(user.id, filters));
  } catch (error) {
    return buddyApiError(error);
  }
}

function stringParam(value: string | null) {
  return value?.trim() || undefined;
}

function parseInteger(value: string | null) {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function parseGender(value: string | null) {
  return value === "male" || value === "female" ? value : undefined;
}
