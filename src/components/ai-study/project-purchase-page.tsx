import { ProjectPurchaseGate } from "@/components/ai-study/project-purchase-gate";
import { StudentSidebar } from "@/components/student-sidebar";
import type { StudyProjectOffer } from "@/lib/study-project-access";

export function ProjectPurchasePage({ offer }: { offer: StudyProjectOffer }) {
  return (
    <main className="min-h-dvh bg-white text-ink lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
      <StudentSidebar active="study-buddy" />
      <section className="min-w-0 px-5 pb-12 pt-8 lg:px-10">
        <ProjectPurchaseGate offer={offer} />
      </section>
    </main>
  );
}
