-- Add BLOCKED to TaskStatusType enum
ALTER TYPE "TaskStatusType" ADD VALUE IF NOT EXISTS 'BLOCKED';

-- Shift existing REVIEW and DONE positions to make room for BLOCKED at position 2.
-- Do it in two phases to avoid transient collisions on (projectId, position).
UPDATE "TaskStatus"
SET "position" = "position" + 100
WHERE "type" IN ('REVIEW', 'DONE');

UPDATE "TaskStatus"
SET "position" = CASE
  WHEN "type" = 'REVIEW' THEN 3
  WHEN "type" = 'DONE' THEN 4
  ELSE "position"
END
WHERE "type" IN ('REVIEW', 'DONE');

-- Insert a Blocked status into every project that does not already have one
INSERT INTO "TaskStatus" ("id", "projectId", "name", "type", "position", "color")
SELECT
  'blocked_' || substr(md5("id" || '_blocked'), 1, 24),
  "id",
  'Blocked',
  'BLOCKED'::"TaskStatusType",
  2,
  '#7f1d1d'
FROM "Project"
WHERE NOT EXISTS (
  SELECT 1 FROM "TaskStatus"
  WHERE "TaskStatus"."projectId" = "Project"."id"
    AND "TaskStatus"."type" = 'BLOCKED'
);
