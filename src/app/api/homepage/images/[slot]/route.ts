import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { homepageImageSlots, type HomepageImageSlot } from "@/lib/homepage-settings";
import { parseHomepageMediaRange } from "@/lib/homepage-media";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ slot: string }> };

async function serveMedia(request: NextRequest, { params }: RouteContext, headOnly: boolean) {
  const { slot } = await params;
  if (!homepageImageSlots.includes(slot as HomepageImageSlot)) {
    return new NextResponse(null, { status: 404 });
  }

  // Keep metadata and body on one snapshot if an administrator replaces the file during playback.
  return prisma.$transaction(async (tx) => {
    const [media] = await tx.$queryRaw<Array<{ contentType: string; updatedAt: Date; size: number }>>`
      SELECT "contentType", "updatedAt", octet_length("body") AS "size"
      FROM "homepage_images" WHERE "slot" = ${slot}
    `;
    if (!media) {
      const response = NextResponse.redirect(new URL(`/images/homepage/${slot}.webp`, request.url));
      response.headers.set("Cache-Control", "no-store");
      return response;
    }

    const version = media.updatedAt.getTime().toString();
    const etag = `"${slot}-${version}-${media.size}"`;
    const headers = new Headers({
      "Content-Type": media.contentType,
      "Cache-Control": request.nextUrl.searchParams.get("v") === version
        ? "public, max-age=31536000, immutable"
        : "public, max-age=0, must-revalidate",
      "ETag": etag,
      "Last-Modified": media.updatedAt.toUTCString(),
      "X-Content-Type-Options": "nosniff"
    });
    if (media.contentType === "video/mp4") headers.set("Accept-Ranges", "bytes");
    const ifNoneMatch = request.headers.get("if-none-match");
    if (ifNoneMatch?.split(",").some((value) => value.trim().replace(/^W\//, "") === etag || value.trim() === "*")) {
      return new NextResponse(null, { status: 304, headers });
    }

    let start = 0;
    let end = media.size - 1;
    let status = 200;
    const range = request.headers.get("range");
    const ifRange = request.headers.get("if-range");
    // Range is defined for GET; HEAD always describes the complete representation.
    if (!headOnly && media.contentType === "video/mp4" && range && (!ifRange || ifRange === etag || ifRange === media.updatedAt.toUTCString())) {
      const parsed = parseHomepageMediaRange(range, media.size);
      if (!parsed) {
        headers.set("Content-Range", `bytes */${media.size}`);
        headers.set("Cache-Control", "no-store");
        return new NextResponse(null, { status: 416, headers });
      }
      ({ start, end } = parsed);
      status = 206;
      headers.set("Content-Range", `bytes ${start}-${end}/${media.size}`);
    }
    const length = end - start + 1;
    headers.set("Content-Length", length.toString());
    if (headOnly) return new NextResponse(null, { headers });

    // Slice in PostgreSQL so seeking does not fetch the entire MP4 into the app process.
    const [row] = await tx.$queryRaw<Array<{ body: Uint8Array }>>`
      SELECT substring("body" FROM ${start + 1}::integer FOR ${length}::integer) AS "body"
      FROM "homepage_images" WHERE "slot" = ${slot}
    `;
    return new NextResponse(new Uint8Array(row.body), { status, headers });
  }, { isolationLevel: "RepeatableRead" });
}

export async function GET(request: NextRequest, context: RouteContext) {
  return serveMedia(request, context, false);
}

export async function HEAD(request: NextRequest, context: RouteContext) {
  return serveMedia(request, context, true);
}
