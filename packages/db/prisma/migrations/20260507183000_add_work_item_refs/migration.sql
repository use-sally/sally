-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "WorkItemProvider" AS ENUM ('SALLY', 'LINEAR', 'JIRA', 'GITHUB');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "WorkItemRef" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "projectId" TEXT,
  "provider" "WorkItemProvider" NOT NULL,
  "externalId" TEXT,
  "externalUrl" TEXT,
  "titleSnapshot" TEXT,
  "descriptionSnapshot" TEXT,
  "sallyTaskId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WorkItemRef_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "AgentJob" ADD COLUMN IF NOT EXISTS "workItemRefId" TEXT;
ALTER TABLE "AgentRun" ADD COLUMN IF NOT EXISTS "workItemRefId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "WorkItemRef_workspaceId_provider_externalId_key" ON "WorkItemRef"("workspaceId", "provider", "externalId");
CREATE UNIQUE INDEX IF NOT EXISTS "WorkItemRef_workspaceId_provider_sallyTaskId_key" ON "WorkItemRef"("workspaceId", "provider", "sallyTaskId");
CREATE INDEX IF NOT EXISTS "WorkItemRef_workspaceId_provider_createdAt_idx" ON "WorkItemRef"("workspaceId", "provider", "createdAt");
CREATE INDEX IF NOT EXISTS "WorkItemRef_projectId_provider_createdAt_idx" ON "WorkItemRef"("projectId", "provider", "createdAt");
CREATE INDEX IF NOT EXISTS "WorkItemRef_sallyTaskId_idx" ON "WorkItemRef"("sallyTaskId");
CREATE INDEX IF NOT EXISTS "AgentJob_workItemRefId_createdAt_idx" ON "AgentJob"("workItemRefId", "createdAt");
CREATE INDEX IF NOT EXISTS "AgentRun_workItemRefId_createdAt_idx" ON "AgentRun"("workItemRefId", "createdAt");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "WorkItemRef" ADD CONSTRAINT "WorkItemRef_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "WorkItemRef" ADD CONSTRAINT "WorkItemRef_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "WorkItemRef" ADD CONSTRAINT "WorkItemRef_sallyTaskId_fkey" FOREIGN KEY ("sallyTaskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "AgentJob" ADD CONSTRAINT "AgentJob_workItemRefId_fkey" FOREIGN KEY ("workItemRefId") REFERENCES "WorkItemRef"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_workItemRefId_fkey" FOREIGN KEY ("workItemRefId") REFERENCES "WorkItemRef"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
