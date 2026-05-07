CREATE TYPE "FeedbackStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "feedback_messages" (
  "id" UUID NOT NULL,
  "text" VARCHAR(50) NOT NULL,
  "color" VARCHAR(20) NOT NULL DEFAULT '#fb78ad',
  "status" "FeedbackStatus" NOT NULL DEFAULT 'PENDING',
  "author_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "feedback_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_feedback_messages_status_created_at" ON "feedback_messages"("status", "created_at");
CREATE INDEX "idx_feedback_messages_author_created_at" ON "feedback_messages"("author_id", "created_at");

ALTER TABLE "feedback_messages"
  ADD CONSTRAINT "feedback_messages_author_id_fkey"
  FOREIGN KEY ("author_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
