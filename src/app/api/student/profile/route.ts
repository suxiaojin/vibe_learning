import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import {
  FoundationSelectionError,
  getStudentFoundationProfile,
  saveStudentFoundationProfile
} from "@/lib/foundation";

const profileSchema = z.object({
  regionId: z.string().min(1),
  publicSubjectId: z.string().min(1),
  majorId: z.string().min(1)
});

export async function GET() {
  const user = await requireUser();
  const profile = await getStudentFoundationProfile(user.id);
  return NextResponse.json({ profile });
}

export async function POST(request: Request) {
  const user = await requireUser();
  const body = await request.json().catch(() => null);
  const parsed = profileSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid profile selection." }, { status: 400 });
  }

  try {
    const profile = await saveStudentFoundationProfile(user.id, parsed.data);
    return NextResponse.json({ profile });
  } catch (error) {
    if (error instanceof FoundationSelectionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
