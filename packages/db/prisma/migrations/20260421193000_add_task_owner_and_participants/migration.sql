ALTER TABLE "Task"
ADD COLUMN IF NOT EXISTS "owner" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TaskParticipantRole') THEN
    CREATE TYPE "TaskParticipantRole" AS ENUM ('OWNER', 'PARTICIPANT');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "TaskParticipant" (
  "taskId" TEXT NOT NULL,
  "participant" TEXT NOT NULL,
  "role" "TaskParticipantRole" NOT NULL,
  "position" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TaskParticipant_pkey" PRIMARY KEY ("taskId", "participant")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TaskParticipant_taskId_fkey') THEN
    ALTER TABLE "TaskParticipant"
    ADD CONSTRAINT "TaskParticipant_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "TaskParticipant_taskId_position_key"
ON "TaskParticipant"("taskId", "position");

CREATE UNIQUE INDEX IF NOT EXISTS "TaskParticipant_single_owner_per_task"
ON "TaskParticipant"("taskId", "role")
WHERE "role" = 'OWNER'::"TaskParticipantRole";

UPDATE "Task"
SET "owner" = NULLIF(TRIM("assignee"), '')
WHERE COALESCE(NULLIF(TRIM("owner"), ''), '') = ''
  AND COALESCE(NULLIF(TRIM("assignee"), ''), '') <> '';

WITH owner_rows AS (
  SELECT t."id" AS "taskId", t."owner" AS "participant"
  FROM "Task" t
  WHERE COALESCE(NULLIF(TRIM(t."owner"), ''), '') <> ''
)
INSERT INTO "TaskParticipant" ("taskId", "participant", "role", "position")
SELECT o."taskId", o."participant", 'OWNER'::"TaskParticipantRole", 0
FROM owner_rows o
WHERE NOT EXISTS (
  SELECT 1 FROM "TaskParticipant" existing
  WHERE existing."taskId" = o."taskId"
    AND existing."participant" = o."participant"
);

WITH collaborator_rows AS (
  SELECT
    tc."taskId",
    NULLIF(TRIM(tc."collaborator"), '') AS "participant",
    ROW_NUMBER() OVER (PARTITION BY tc."taskId" ORDER BY TRIM(tc."collaborator"), tc."createdAt", tc."collaborator") AS collaborator_position
  FROM "TaskCollaborator" tc
),
owner_offsets AS (
  SELECT t."id" AS "taskId", CASE WHEN COALESCE(NULLIF(TRIM(t."owner"), ''), '') <> '' THEN 1 ELSE 0 END AS owner_offset
  FROM "Task" t
)
INSERT INTO "TaskParticipant" ("taskId", "participant", "role", "position")
SELECT c."taskId", c."participant", 'PARTICIPANT'::"TaskParticipantRole", owner_offsets.owner_offset + c.collaborator_position - 1
FROM collaborator_rows c
JOIN owner_offsets ON owner_offsets."taskId" = c."taskId"
WHERE c."participant" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "TaskParticipant" existing
    WHERE existing."taskId" = c."taskId"
      AND existing."participant" = c."participant"
  );

WITH normalized_people AS (
  SELECT
    tp."taskId",
    tp."participant",
    ROW_NUMBER() OVER (
      PARTITION BY tp."taskId"
      ORDER BY CASE WHEN tp."role" = 'OWNER'::"TaskParticipantRole" THEN 0 ELSE 1 END, tp."position", tp."createdAt", tp."participant"
    ) - 1 AS next_position
  FROM "TaskParticipant" tp
)
UPDATE "TaskParticipant" tp
SET "position" = normalized_people.next_position
FROM normalized_people
WHERE tp."taskId" = normalized_people."taskId"
  AND tp."participant" = normalized_people."participant"
  AND tp."position" <> normalized_people.next_position;