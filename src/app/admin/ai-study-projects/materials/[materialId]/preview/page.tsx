import { notFound } from "next/navigation";
import { OfficialStudyMaterialViewer } from "@/components/ai-study/official-study-material-viewer";
import { requireAdmin } from "@/lib/auth";
import {
  formatOfficialStudyMaterialError,
  getAdminOfficialStudyMaterial
} from "@/lib/official-study-materials";

export const dynamic = "force-dynamic";

export default async function AdminOfficialStudyMaterialPreviewPage({
  params
}: {
  params: Promise<{ materialId: string }>;
}) {
  await requireAdmin();
  const { materialId } = await params;
  try {
    const material = await getAdminOfficialStudyMaterial(materialId);
    return (
      <main className="panel">
        <OfficialStudyMaterialViewer
          backHref="/admin/ai-study-projects"
          backTitle="返回项目管理"
          fileUrl={`/api/admin/study-materials/${material.id}/file`}
          material={material}
        />
      </main>
    );
  } catch (error) {
    if (formatOfficialStudyMaterialError(error)?.status === 404) {
      notFound();
    }
    throw error;
  }
}
