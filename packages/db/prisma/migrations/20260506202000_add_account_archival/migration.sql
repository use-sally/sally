-- Add soft archival for central Team user lifecycle management.
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Account_archivedAt_idx" ON "Account"("archivedAt");
