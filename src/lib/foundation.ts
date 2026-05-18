import { prisma } from "@/lib/prisma";

export class FoundationSelectionError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "FoundationSelectionError";
    this.status = status;
  }
}

export async function getFoundationOptions(regionId?: string) {
  const regions = await prisma.region.findMany({
    where: { status: "active" },
    select: {
      id: true,
      name: true,
      province: true,
      studySystem: true,
      description: true
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
  });

  const selectedRegionId = regionId || regions[0]?.id || null;
  if (!selectedRegionId) {
    return { regions, selectedRegionId, publicSubjects: [], majors: [] };
  }
  if (regionId && !regions.some((region) => region.id === regionId)) {
    throw new FoundationSelectionError("Selected region is unavailable.");
  }

  const [publicSubjects, majors] = await Promise.all([
    prisma.publicSubject.findMany({
      where: {
        status: "published",
        regions: { some: { regionId: selectedRegionId } }
      },
      select: {
        id: true,
        name: true,
        code: true,
        description: true
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
    }),
    prisma.major.findMany({
      where: {
        status: "published",
        regions: { some: { regionId: selectedRegionId } }
      },
      select: {
        id: true,
        name: true,
        description: true
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
    })
  ]);

  return { regions, selectedRegionId, publicSubjects, majors };
}

export async function getStudentFoundationProfile(userId: string) {
  return prisma.studentProfile.findUnique({
    where: { userId },
    include: {
      region: true,
      publicSubject: true,
      major: true
    }
  });
}

export async function hasCompletedFoundationProfile(userId: string) {
  const profile = await prisma.studentProfile.findUnique({
    where: { userId },
    select: {
      regionId: true,
      publicSubjectId: true,
      majorId: true
    }
  });

  return Boolean(profile?.regionId && profile.publicSubjectId && profile.majorId);
}

export async function saveStudentFoundationProfile(
  userId: string,
  input: { regionId: string; publicSubjectId: string; majorId: string }
) {
  const region = await prisma.region.findFirst({
    where: { id: input.regionId, status: "active" },
    select: { id: true }
  });
  if (!region) {
    throw new FoundationSelectionError("Selected region is unavailable.");
  }

  const [publicSubject, major] = await Promise.all([
    prisma.publicSubject.findFirst({
      where: {
        id: input.publicSubjectId,
        status: "published",
        regions: { some: { regionId: input.regionId } }
      },
      select: { id: true }
    }),
    prisma.major.findFirst({
      where: {
        id: input.majorId,
        status: "published",
        regions: { some: { regionId: input.regionId } }
      },
      select: { id: true }
    })
  ]);

  if (!publicSubject) {
    throw new FoundationSelectionError("Selected public subject is unavailable for this region.");
  }
  if (!major) {
    throw new FoundationSelectionError("Selected major is unavailable for this region.");
  }

  return prisma.studentProfile.upsert({
    where: { userId },
    update: {
      regionId: input.regionId,
      publicSubjectId: input.publicSubjectId,
      majorId: input.majorId
    },
    create: {
      userId,
      regionId: input.regionId,
      publicSubjectId: input.publicSubjectId,
      majorId: input.majorId
    },
    include: {
      region: true,
      publicSubject: true,
      major: true
    }
  });
}
