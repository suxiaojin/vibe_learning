import { MarkdownContent } from "@/components/agreement-content-page";
import { StudentPageShell } from "@/components/student-page-shell";
import { requireUser } from "@/lib/auth";
import { getSystemSettings } from "@/lib/system-settings";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HelpPage() {
  await requireUser();
  const settings = await getSystemSettings();

  return (
    <StudentPageShell active="help" maxWidthClassName="max-w-4xl">
      <section className="overflow-hidden rounded-[22px] border border-slate-200/80 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
        <article className="px-6 py-7 sm:px-8 sm:py-8">
          <MarkdownContent content={settings.faqContent} />
        </article>
      </section>
    </StudentPageShell>
  );
}
