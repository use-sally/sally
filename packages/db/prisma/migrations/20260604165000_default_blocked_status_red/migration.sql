-- Ensure existing default Blocked statuses use the red status color.
UPDATE "TaskStatus"
SET "color" = '#7F1D1D'
WHERE "type" = 'BLOCKED'
  AND ("color" IS NULL OR upper("color") IN ('#1F2937', '#7F1D1D', '#7f1d1d'));
