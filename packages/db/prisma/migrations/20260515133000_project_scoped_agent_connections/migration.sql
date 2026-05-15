ALTER TABLE "AgentConnection" ADD COLUMN IF NOT EXISTS "projectId" TEXT;
ALTER TABLE "AgentPairingCode" ADD COLUMN IF NOT EXISTS "projectId" TEXT;

CREATE INDEX IF NOT EXISTS "AgentConnection_workspaceId_projectId_status_updatedAt_idx" ON "AgentConnection"("workspaceId", "projectId", "status", "updatedAt");
CREATE INDEX IF NOT EXISTS "AgentPairingCode_workspaceId_projectId_expiresAt_idx" ON "AgentPairingCode"("workspaceId", "projectId", "expiresAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgentConnection_projectId_fkey') THEN
    ALTER TABLE "AgentConnection" ADD CONSTRAINT "AgentConnection_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgentPairingCode_projectId_fkey') THEN
    ALTER TABLE "AgentPairingCode" ADD CONSTRAINT "AgentPairingCode_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
