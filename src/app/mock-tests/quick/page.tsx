import { redirect } from "next/navigation";
import { normalizeMockTestCourseKey } from "@/lib/mock-tests";

export default async function QuickMockTestPage({
  searchParams
}: {
  searchParams?: Promise<{ course?: string }>;
}) {
  const query = await searchParams;
  const courseKey = normalizeMockTestCourseKey(query?.course);

  redirect(`/mock-tests/special?course=${courseKey}`);
}
