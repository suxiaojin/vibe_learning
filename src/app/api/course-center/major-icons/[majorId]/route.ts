import { NextResponse } from "next/server";
import { downloadAiStudyObject } from "@/lib/ai-study-storage";
import { isCourseCenterMajorIconObjectKey } from "@/lib/student-nav-icon-storage";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ majorId: string }> }
) {
  const { majorId } = await context.params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(majorId)) {
    return new NextResponse(null, { status: 404 });
  }

  const major = await prisma.major.findUnique({
    where: { id: majorId },
    select: { courseCenterIconKey: true }
  });
  const objectKey = major?.courseCenterIconKey || "";
  if (!objectKey || !isCourseCenterMajorIconObjectKey(objectKey)) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const image = await downloadAiStudyObject(objectKey);
    return new NextResponse(new Uint8Array(image.body), {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Type": "image/webp",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    console.error("Failed to load course center major icon", error);
    return new NextResponse(null, { status: 502 });
  }
}
