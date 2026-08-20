CREATE TABLE "buddy_feed_read_states" (
    "userId" TEXT NOT NULL,
    "followingReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "buddy_feed_read_states_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "buddy_feed_read_states"
ADD CONSTRAINT "buddy_feed_read_states_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "buddy_feed_read_states" ("userId", "followingReadAt", "createdAt", "updatedAt")
SELECT "id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "users"
WHERE "role" = 'student';
