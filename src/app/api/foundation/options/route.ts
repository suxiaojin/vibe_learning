import { apiError, apiOk } from "@/lib/api-response";
import { FoundationSelectionError, getFoundationOptions } from "@/lib/foundation";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const regionId = url.searchParams.get("regionId") || undefined;
  try {
    const options = await getFoundationOptions(regionId);
    return apiOk(options);
  } catch (error) {
    if (error instanceof FoundationSelectionError) {
      return apiError(error.message, error.status, "FOUNDATION_REGION_UNAVAILABLE");
    }
    throw error;
  }
}
