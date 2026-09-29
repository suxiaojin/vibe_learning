import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { homepageImageSlots, type HomepageImageSlot } from "@/lib/homepage-settings";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest, { params }: { params: Promise<{ slot: string }> }) {
  const { slot } = await params;
  if (!homepageImageSlots.includes(slot as HomepageImageSlot)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const image = await prisma.homepageImage.findUnique({
    where: { slot },
    select: { body: true, contentType: true }
  });
  if (!image) {
    return NextResponse.redirect(new URL(`/images/homepage/${slot}.webp`, request.url));
  }

  return new NextResponse(new Uint8Array(image.body), {
    headers: {
      "Content-Type": image.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
