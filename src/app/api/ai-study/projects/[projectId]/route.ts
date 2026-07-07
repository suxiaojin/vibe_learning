import { apiError, apiOk } from "@/lib/api-response";
import {
  formatAiStudyError,
  getAiStudyProject,
  deleteAiStudyProject,
  updateAiStudyProject
} from "@/lib/ai-study";
import { getStudentApiUser } from "@/lib/student-api";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { user, response } = await getStudentApiUser();
  if (!user) {
    return response;
  }

  try {
    const { projectId } = await context.params;
    const project = await getAiStudyProject(user.id, projectId);
    return apiOk({ project });
  } catch (error) {
    return aiStudyApiError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { user, response } = await getStudentApiUser();
  if (!user) {
    return response;
  }

  try {
    const { projectId } = await context.params;
    const result = await deleteAiStudyProject(user.id, projectId);
    return apiOk(result);
  } catch (error) {
    return aiStudyApiError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const { user, response } = await getStudentApiUser();
  if (!user) {
    return response;
  }

  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return apiError("Invalid JSON body.", 400, "INVALID_JSON");
    }

    const { projectId } = await context.params;
    const project = await updateAiStudyProject(user.id, projectId, body);
    return apiOk({ project });
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
