CREATE TYPE "QuestionAttemptGradingStatus" AS ENUM ('auto_graded', 'ungraded');

ALTER TABLE "question_attempts"
ADD COLUMN "gradingStatus" "QuestionAttemptGradingStatus" NOT NULL DEFAULT 'auto_graded';

UPDATE "question_attempts" AS attempt
SET "gradingStatus" = 'ungraded'
FROM "questions" AS question
WHERE attempt."questionId" = question."id"
  AND question."type" NOT IN ('single_choice', 'multiple_choice', 'true_false', 'fill_blank');

DELETE FROM "wrong_questions" AS wrong_question
USING "questions" AS question
WHERE wrong_question."questionId" = question."id"
  AND question."type" NOT IN ('single_choice', 'multiple_choice', 'true_false', 'fill_blank');

WITH "session_scores" AS (
  SELECT
    "sessionId",
    COUNT(*) FILTER (WHERE "gradingStatus" = 'auto_graded')::INTEGER AS "scoredTotal",
    COUNT(*) FILTER (WHERE "gradingStatus" = 'auto_graded' AND "isCorrect" = TRUE)::INTEGER AS "correctTotal"
  FROM "question_attempts"
  WHERE "sessionId" IS NOT NULL
  GROUP BY "sessionId"
)
UPDATE "quiz_sessions" AS session
SET
  "correctCount" = session_score."correctTotal",
  "totalCount" = session_score."scoredTotal",
  "score" = CASE
    WHEN session_score."scoredTotal" > 0
      THEN ROUND(session_score."correctTotal" * 100.0 / session_score."scoredTotal")::INTEGER
    ELSE NULL
  END
FROM "session_scores" AS session_score
WHERE session."id" = session_score."sessionId"
  AND session."status" = 'completed';

CREATE INDEX "question_attempts_userId_gradingStatus_isCorrect_idx"
ON "question_attempts"("userId", "gradingStatus", "isCorrect");

CREATE INDEX "question_attempts_sessionId_gradingStatus_isCorrect_idx"
ON "question_attempts"("sessionId", "gradingStatus", "isCorrect");
