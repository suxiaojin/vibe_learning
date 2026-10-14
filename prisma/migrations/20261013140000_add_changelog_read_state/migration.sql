CREATE TABLE "changelog_read_states" (
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "changelog_read_states_pkey" PRIMARY KEY ("userId")
);

INSERT INTO "changelog_read_states" ("userId", "readAt", "createdAt", "updatedAt")
SELECT
    "id",
    CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
    CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
    CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
FROM "users"
WHERE "role" = 'student'
ON CONFLICT ("userId") DO NOTHING;

ALTER TABLE "changelog_read_states"
ADD CONSTRAINT "changelog_read_states_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
