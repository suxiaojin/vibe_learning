import { apiError, apiOk } from "@/lib/api-response";
import {
  createAiStudyProject,
  formatAiStudyError,
  listAiStudyProjects
} from "@/lib/ai-study";
import { getStudentApiUser } from "@/lib/student-api";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { user, response } = await getStudentApiUser();
  if (!user) {
    return response;
  }

  try {
    const url = new URL(request.url);
    const projects = await listAiStudyProjects(user.id, {
      status: url.searchParams.get("status")
    });
    return apiOk({ projects });
  } catch (error) {
    return aiStudyApiError(error);
  }
}

export async function POST(request: Request) {
  const { user, response } = await getStudentApiUser();
  if (!user) {
    return response;
  }

  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return apiError("Invalid JSON body.", 400, "INVALID_JSON");
    }

    const project = await createAiStudyProject(user.id, body);
    return apiOk({ project }, { status: 201 });
  } catch (error) {
    return aiStudyApiError(error);
  }
}

function aiStudyApiError(error: unknown) {
  const formatted = formatAiStudyError(error);
  if (formatted) {
    return apiError(formatted.message, formatted.status, formatted.code);
  }
  throw error;
}
