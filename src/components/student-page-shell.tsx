import type { ReactNode } from "react";
import { StudentSidebar } from "@/components/student-sidebar";
import { cn } from "@/lib/utils";

type StudentNavKey = "learn" | "course-center" | "study-buddy" | "buddy-circle" | "me" | "notifications" | "settings" | "help";

export function StudentPageShell({
  active,
  children,
  contentClassName,
  maxWidthClassName = "max-w-6xl"
}: {
  active: StudentNavKey;
  children: ReactNode;
  contentClassName?: string;
  maxWidthClassName?: string;
}) {
  return (
    <main className="min-h-dvh bg-mist text-ink lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
      <StudentSidebar active={active} />

      <section className={cn("min-w-0 px-5 py-8 lg:px-8 xl:px-10", contentClassName)}>
        <div className={cn("mx-auto w-full", maxWidthClassName)}>{children}</div>
      </section>
    </main>
  );
}
