import { NextResponse } from "next/server";
import { clearSession } from "@/lib/auth";

function redirectTo(request: Request, path: string) {
  const origin = request.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return NextResponse.redirect(new URL(path, origin), 303);
}

export async function POST(request: Request) {
  await clearSession();
  return redirectTo(request, "/login");
}

export async function GET(request: Request) {
  await clearSession();
  return redirectTo(request, "/login");
}
