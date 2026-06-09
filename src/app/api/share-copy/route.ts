import { apiError, apiOk } from "@/lib/api-response";
import { isShareCopyContext, listShareCopyStyles } from "@/lib/share-copy";
import { getStudentApiUser } from "@/lib/student-api";

export async function GET(request: Request) {
  const { user, response } = await getStudentApiUser();
  if (!user) {
    return response;
  }

  const url = new URL(request.url);
  const context = url.searchParams.get("context") || "";
  if (!isShareCopyContext(context)) {
    return apiError("Invalid share copy context.", 400, "INVALID_SHARE_COPY_CONTEXT");
  }

  const styles = await listShareCopyStyles(context);
  return apiOk({ styles });
}
