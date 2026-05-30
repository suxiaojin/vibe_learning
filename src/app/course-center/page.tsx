import { StudentSidebar } from "@/components/student-sidebar";
import { CourseCenterForm } from "@/components/course-center-form";
import { requireUser } from "@/lib/auth";
import { getFoundationOptions, getStudentFoundationProfile } from "@/lib/foundation";

export default async function CourseCenterPage() {
  const user = await requireUser();
  const profile = await getStudentFoundationProfile(user.id);
  let options = await getFoundationOptions(profile?.regionId || undefined).catch(() => null);

  if (!options) {
    options = await getFoundationOptions();
  }

  const currentProfile = profile
    ? {
        regionId: profile.regionId,
        publicSubjectId: profile.publicSubjectId,
        majorId: profile.majorId,
        regionName: profile.region?.name || "",
        province: profile.region?.province || "",
        studySystem: profile.region?.studySystem || "",
        publicSubjectName: profile.publicSubject?.name || "",
        majorName: profile.major?.name || ""
      }
    : null;

  return (
    <main className="min-h-dvh bg-mist lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      <StudentSidebar active="course-center" />

      <section className="min-w-0 px-5 py-8 lg:px-8">
        <div className="mx-auto w-full max-w-5xl">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-6">
            <div>
              <p className="text-sm font-black text-sky-500">Vibe Learning</p>
              <h1 className="mt-2 text-3xl font-black text-ink">课程中心</h1>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-500 shadow-sm">
              {user.username}
            </div>
          </div>

          <CourseCenterForm initialOptions={options} currentProfile={currentProfile} />
        </div>
      </section>
    </main>
  );
}
