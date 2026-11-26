import { NextRequest, NextResponse } from "next/server";

type AppSurface = "all" | "student" | "admin";

const publicAssetPattern = /\.(?:avif|css|gif|ico|jpg|jpeg|js|map|png|svg|txt|webmanifest|webp|xml)$/i;

function getAppSurface(request: NextRequest): AppSurface {
  const configuredSurface = process.env.APP_SURFACE;
  if (configuredSurface === "student" || configuredSurface === "admin") {
    return configuredSurface;
  }

  const host = request.headers.get("host") || "";
  const port = host.split(":").at(-1);
  if (port === "3001") {
    return "admin";
  }
  if (port === "3000") {
    return "student";
  }

  return "all";
}

function isAdminPath(pathname: string) {
  return pathname === "/sxjvbcontrol" || pathname.startsWith("/sxjvbcontrol/") || pathname === "/api/admin" || pathname.startsWith("/api/admin/");
}

function isPublicAsset(pathname: string) {
  return (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/uploads/") ||
    pathname.startsWith("/api/homepage/images/") ||
    pathname === "/favicon.ico" ||
    publicAssetPattern.test(pathname)
  );
}

function notFound(pathname: string) {
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return new NextResponse("Not found", { status: 404 });
}

export function middleware(request: NextRequest) {
  const surface = getAppSurface(request);
  const { pathname } = request.nextUrl;

  if (surface === "all") {
    return NextResponse.next();
  }

  const adminPath = isAdminPath(pathname);
  if (surface === "student") {
    return adminPath ? notFound(pathname) : NextResponse.next();
  }

  if (adminPath || isPublicAsset(pathname)) {
    return NextResponse.next();
  }

  return notFound(pathname);
}

export const config = {
  matcher: ["/((?!_next/image|api/ai-study/projects/.+/sources|api/admin/study-materials(?:/)?$).*)"]
};
