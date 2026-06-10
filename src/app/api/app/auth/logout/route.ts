import { apiOk } from "@/lib/api-response";
import { clearSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  await clearSession();
  return apiOk({ loggedOut: true });
}
