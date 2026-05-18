import { NextResponse } from "next/server";
import { getFoundationOptions } from "@/lib/foundation";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const regionId = url.searchParams.get("regionId") || undefined;
  const options = await getFoundationOptions(regionId);
  return NextResponse.json(options);
}
