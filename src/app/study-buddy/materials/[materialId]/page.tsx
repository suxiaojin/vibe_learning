import { notFound } from "next/navigation";
import { OfficialStudyMaterialViewer } from "@/components/ai-study/official-study-material-viewer";
import { StudentSidebar } from "@/components/student-sidebar";
import { requireUser } from "@/lib/auth";
import { ProjectPurchasePage } from "@/components/ai-study/project-purchase-page";
import { getStudyProjectOffer, StudyProjectAccessError } from "@/lib/study-project-access";
import {
  formatOfficialStudyMaterialError,
  getPublicOfficialStudyMaterial
} from "@/lib/official-study-materials";

export const dynamic = "force-dynamic";

export default async function OfficialStudyMaterialPage({
  params
}: {
  params: Promise<{ materialId: string }>;
}) {
  const user = await requireUser();
  const { materialId } = await params;
  try {
    const offer = await getStudyProjectOffer(user.id, "official", materialId);
    if (offer.requiresPurchase) return <ProjectPurchasePage offer={offer} />;
    const material = await getPublicOfficialStudyMaterial(materialId, user.id);
    return (
      <main className="min-h-dvh bg-[#f8fafc] text-[#111827] lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
        <StudentSidebar active="study-buddy" />
        <section className="min-w-0 px-5 pb-12 pt-8 lg:px-10">
          <OfficialStudyMaterialViewer
            backHref="/study-buddy"
            backTitle="返回学习搭子"
            fileUrl={`/api/study-materials/${material.id}/file`}
            material={material}
          />
        </section>
      </main>
    );
  } catch (error) {
    if (formatOfficialStudyMaterialError(error)?.status === 404 || error instanceof StudyProjectAccessError) {
      notFound();
    }
    throw error;
  }
}
