ALTER TABLE "chapter_challenge_versions"
ADD COLUMN "difficultyRating" DECIMAL(2,1);

ALTER TABLE "chapter_challenge_versions"
ADD CONSTRAINT "chapter_challenge_versions_difficulty_rating_check"
CHECK (
  "difficultyRating" IS NULL
  OR (
    "difficultyRating" BETWEEN 0.5 AND 5.0
    AND MOD("difficultyRating" * 10, 5) = 0
  )
);
