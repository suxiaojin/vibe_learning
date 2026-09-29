import { NextResponse } from "next/server";
import { downloadAiStudyObject } from "@/lib/ai-study-storage";
import { getStudentNavIconSlot } from "@/lib/student-nav-icons";
import { isStudentNavIconObjectKey } from "@/lib/student-nav-icon-storage";
import { getSystemSettings } from "@/lib/system-settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ icon: string }> }
) {
  const { icon } = await context.params;
  const slot = getStudentNavIconSlot(icon);
  if (!slot) return new NextResponse(null, { status: 404 });

  const settings = await getSystemSettings([slot.settingKey]);
  const objectKey = settings[slot.settingKey];
  if (!objectKey || !isStudentNavIconObjectKey(objectKey, slot.key)) {
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
    console.error("Failed to load student navigation icon", error);
    return new NextResponse(null, { status: 502 });
  }
}
