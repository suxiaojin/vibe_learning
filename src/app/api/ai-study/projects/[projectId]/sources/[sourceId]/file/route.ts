import { apiError } from "@/lib/api-response";
import { downloadAiStudyObject } from "@/lib/ai-study-storage";
import { prisma } from "@/lib/prisma";
import { accessibleAiStudyProjectWhere } from "@/lib/study-project-access";
import { getStudentApiUser } from "@/lib/student-api";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ projectId: string; sourceId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { user, response } = await getStudentApiUser();
  if (!user) return response;

  const { projectId, sourceId } = await context.params;
  const project = await prisma.aiStudyProject.findFirst({
    where: { id: projectId, ...accessibleAiStudyProjectWhere(user.id) },
    select: {
      sources: {
        where: { id: sourceId, sourceType: "pdf" },
        select: { storageKey: true },
        take: 1
      }
    }
  });
  const storageKey = project?.sources[0]?.storageKey;
  if (!storageKey) return apiError("原始 PDF 不存在。", 404, "AI_STUDY_SOURCE_FILE_NOT_FOUND");

  try {
    const object = await downloadAiStudyObject(storageKey);
    return new Response(new Uint8Array(object.body), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": "inline; filename=source.pdf",
        "Content-Length": String(object.body.length),
        "Content-Type": "application/pdf",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    console.error("Failed to load AI study source PDF.", error);
    return apiError("原始 PDF 暂时无法加载。", 503, "AI_STUDY_SOURCE_FILE_UNAVAILABLE");
  }
}
