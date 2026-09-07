import { deleteStoredAvatarByUrl, storeAvatarBuffer } from "../src/lib/avatar-storage";
import { prisma } from "../src/lib/prisma";

const avatarDataUrlPattern = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;

async function main() {
  const profiles = await prisma.studentProfile.findMany({
    where: { avatarImage: { startsWith: "data:image/" } },
    select: { userId: true, avatarImage: true }
  });
  let migrated = 0;
  let skipped = 0;

  for (const profile of profiles) {
    const parsed = parseAvatarDataUrl(profile.avatarImage || "");
    if (!parsed) {
      skipped += 1;
      console.warn(`Skipped invalid avatar data URL for user ${profile.userId}.`);
      continue;
    }

    let stored: Awaited<ReturnType<typeof storeAvatarBuffer>> | null = null;
    try {
      stored = await storeAvatarBuffer(profile.userId, parsed.body, parsed.contentType);
      const result = await prisma.studentProfile.updateMany({
        where: { userId: profile.userId, avatarImage: { startsWith: "data:image/" } },
        data: { avatarImage: stored.url }
      });
      if (result.count === 0) {
        await deleteStoredAvatarByUrl(stored.url).catch(() => undefined);
        skipped += 1;
        continue;
      }
      migrated += 1;
    } catch (error) {
      if (stored) {
        await deleteStoredAvatarByUrl(stored.url).catch(() => undefined);
      }
      skipped += 1;
      console.error(`Failed to migrate avatar for user ${profile.userId}:`, error instanceof Error ? error.message : error);
    }
  }

  console.log(`Avatar migration completed. Migrated: ${migrated}; skipped: ${skipped}; total: ${profiles.length}.`);
}

function parseAvatarDataUrl(value: string) {
  const match = avatarDataUrlPattern.exec(value);
  if (!match) {
    return null;
  }
  return {
    body: Buffer.from(match[2], "base64"),
    contentType: match[1]
  };
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
