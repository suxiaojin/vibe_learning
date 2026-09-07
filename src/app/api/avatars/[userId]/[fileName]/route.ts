import { NextResponse } from "next/server";
import { downloadAiStudyObject } from "@/lib/ai-study-storage";
import { getAvatarStorageKey } from "@/lib/avatar-storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ fileName: string; userId: string }> }
) {
  const { fileName, userId } = await params;
  let key = "";
  try {
    key = getAvatarStorageKey(userId, fileName);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const object = await downloadAiStudyObject(key);
    return new NextResponse(new Uint8Array(object.body), {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Type": "image/webp",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
