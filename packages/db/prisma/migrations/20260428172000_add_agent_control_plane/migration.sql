DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PrincipalType') THEN
    CREATE TYPE "PrincipalType" AS ENUM ('HUMAN', 'AGENT');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'WorkflowStage') THEN
    CREATE TYPE "WorkflowStage" AS ENUM ('INTAKE', 'ARCHITECTURE', 'EXECUTION', 'REVIEW', 'TESTING', 'REWORK', 'APPROVAL_NEEDED', 'BLOCKED', 'DEPLOYMENT', 'DONE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AgentJobStatus') THEN
    CREATE TYPE "AgentJobStatus" AS ENUM ('QUEUED', 'CLAIMED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'BLOCKED', 'CANCELLED', 'TIMED_OUT');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AgentRunStatus') THEN
    CREATE TYPE "AgentRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'BLOCKED', 'CANCELLED', 'TIMED_OUT');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ApprovalType') THEN
    CREATE TYPE "ApprovalType" AS ENUM ('LIVE_DEPLOY', 'CREDENTIAL', 'PAYMENT_DATA', 'CUSTOMER_DATA', 'CLIENT_DECISION', 'DESTRUCTIVE_ACTION', 'PUBLISHING');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ApprovalStatus') THEN
    CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BlockerType') THEN
    CREATE TYPE "BlockerType" AS ENUM ('CREDENTIAL', 'ACCESS', 'STAGING_FAILURE', 'ARCHITECTURE_CONFLICT', 'TEST_FAILURE', 'CLIENT_DECISION', 'LIVE_APPROVAL', 'DEPENDENCY', 'AMBIGUITY', 'TOOLING_FAILURE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BlockerStatus') THEN
    CREATE TYPE "BlockerStatus" AS ENUM ('OPEN', 'RESOLVED', 'CANCELLED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "AgentIdentity" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "accountId" TEXT,
  "name" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "principalType" "PrincipalType" NOT NULL DEFAULT 'AGENT',
  "hermesProfile" TEXT,
  "allowedProjects" JSONB,
  "allowedTaskKinds" JSONB,
  "capabilities" JSONB,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "lastSeenAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgentIdentity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ProjectAutomationConfig" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "workflowEnabled" BOOLEAN NOT NULL DEFAULT false,
  "defaultPmAgentId" TEXT,
  "roleAgents" JSONB,
  "baselineTaskIds" JSONB,
  "requiredCapabilities" JSONB,
  "liveActionsRequireApproval" BOOLEAN NOT NULL DEFAULT true,
  "stagingFirst" BOOLEAN NOT NULL DEFAULT true,
  "currentStage" "WorkflowStage" NOT NULL DEFAULT 'INTAKE',
  "nextRole" TEXT,
  "automationState" TEXT NOT NULL DEFAULT 'idle',
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectAutomationConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AgentJob" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "projectId" TEXT,
  "taskId" TEXT,
  "agentId" TEXT,
  "createdById" TEXT,
  "role" TEXT NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'task',
  "status" "AgentJobStatus" NOT NULL DEFAULT 'QUEUED',
  "triggerType" TEXT NOT NULL,
  "workflowRunId" TEXT,
  "workflowStep" INTEGER,
  "maxSteps" INTEGER,
  "payload" JSONB,
  "lockedAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgentJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AgentRun" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "projectId" TEXT,
  "taskId" TEXT,
  "jobId" TEXT,
  "agentId" TEXT,
  "role" TEXT NOT NULL,
  "status" "AgentRunStatus" NOT NULL DEFAULT 'QUEUED',
  "triggerType" TEXT NOT NULL,
  "provider" TEXT,
  "model" TEXT,
  "workflowRunId" TEXT,
  "workflowStep" INTEGER,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "latestHeartbeatAt" TIMESTAMP(3),
  "summary" TEXT,
  "logUrl" TEXT,
  "evidenceUrl" TEXT,
  "error" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ApprovalRequest" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "projectId" TEXT,
  "taskId" TEXT,
  "requestedByAgentId" TEXT,
  "decidedByAccountId" TEXT,
  "type" "ApprovalType" NOT NULL,
  "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "question" TEXT NOT NULL,
  "options" JSONB,
  "recommendation" TEXT,
  "decisionNote" TEXT,
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Blocker" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "projectId" TEXT,
  "taskId" TEXT,
  "ownerAgentId" TEXT,
  "type" "BlockerType" NOT NULL,
  "status" "BlockerStatus" NOT NULL DEFAULT 'OPEN',
  "summary" TEXT NOT NULL,
  "requiredInput" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Blocker_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AgentIdentity_accountId_key" ON "AgentIdentity"("accountId");
CREATE UNIQUE INDEX IF NOT EXISTS "AgentIdentity_workspaceId_role_name_key" ON "AgentIdentity"("workspaceId", "role", "name");
CREATE INDEX IF NOT EXISTS "AgentIdentity_workspaceId_role_idx" ON "AgentIdentity"("workspaceId", "role");
CREATE INDEX IF NOT EXISTS "AgentIdentity_workspaceId_enabled_idx" ON "AgentIdentity"("workspaceId", "enabled");

CREATE UNIQUE INDEX IF NOT EXISTS "ProjectAutomationConfig_projectId_key" ON "ProjectAutomationConfig"("projectId");
CREATE INDEX IF NOT EXISTS "ProjectAutomationConfig_workspaceId_workflowEnabled_idx" ON "ProjectAutomationConfig"("workspaceId", "workflowEnabled");
CREATE INDEX IF NOT EXISTS "ProjectAutomationConfig_currentStage_idx" ON "ProjectAutomationConfig"("currentStage");

CREATE INDEX IF NOT EXISTS "AgentJob_workspaceId_status_createdAt_idx" ON "AgentJob"("workspaceId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "AgentJob_projectId_status_createdAt_idx" ON "AgentJob"("projectId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "AgentJob_taskId_createdAt_idx" ON "AgentJob"("taskId", "createdAt");
CREATE INDEX IF NOT EXISTS "AgentJob_workflowRunId_workflowStep_idx" ON "AgentJob"("workflowRunId", "workflowStep");

CREATE INDEX IF NOT EXISTS "AgentRun_workspaceId_status_createdAt_idx" ON "AgentRun"("workspaceId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "AgentRun_projectId_status_createdAt_idx" ON "AgentRun"("projectId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "AgentRun_taskId_createdAt_idx" ON "AgentRun"("taskId", "createdAt");
CREATE INDEX IF NOT EXISTS "AgentRun_jobId_idx" ON "AgentRun"("jobId");
CREATE INDEX IF NOT EXISTS "AgentRun_workflowRunId_workflowStep_idx" ON "AgentRun"("workflowRunId", "workflowStep");

CREATE INDEX IF NOT EXISTS "ApprovalRequest_workspaceId_status_createdAt_idx" ON "ApprovalRequest"("workspaceId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "ApprovalRequest_projectId_status_createdAt_idx" ON "ApprovalRequest"("projectId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "ApprovalRequest_taskId_status_createdAt_idx" ON "ApprovalRequest"("taskId", "status", "createdAt");

CREATE INDEX IF NOT EXISTS "Blocker_workspaceId_status_createdAt_idx" ON "Blocker"("workspaceId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "Blocker_projectId_status_createdAt_idx" ON "Blocker"("projectId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "Blocker_taskId_status_createdAt_idx" ON "Blocker"("taskId", "status", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgentIdentity_workspaceId_fkey') THEN
    ALTER TABLE "AgentIdentity" ADD CONSTRAINT "AgentIdentity_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgentIdentity_accountId_fkey') THEN
    ALTER TABLE "AgentIdentity" ADD CONSTRAINT "AgentIdentity_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProjectAutomationConfig_workspaceId_fkey') THEN
    ALTER TABLE "ProjectAutomationConfig" ADD CONSTRAINT "ProjectAutomationConfig_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProjectAutomationConfig_projectId_fkey') THEN
    ALTER TABLE "ProjectAutomationConfig" ADD CONSTRAINT "ProjectAutomationConfig_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgentJob_workspaceId_fkey') THEN
    ALTER TABLE "AgentJob" ADD CONSTRAINT "AgentJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgentJob_projectId_fkey') THEN
    ALTER TABLE "AgentJob" ADD CONSTRAINT "AgentJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgentJob_taskId_fkey') THEN
    ALTER TABLE "AgentJob" ADD CONSTRAINT "AgentJob_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgentJob_agentId_fkey') THEN
    ALTER TABLE "AgentJob" ADD CONSTRAINT "AgentJob_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AgentIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgentJob_createdById_fkey') THEN
    ALTER TABLE "AgentJob" ADD CONSTRAINT "AgentJob_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgentRun_workspaceId_fkey') THEN
    ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgentRun_projectId_fkey') THEN
    ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgentRun_taskId_fkey') THEN
    ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgentRun_jobId_fkey') THEN
    ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "AgentJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgentRun_agentId_fkey') THEN
    ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AgentIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ApprovalRequest_workspaceId_fkey') THEN
    ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ApprovalRequest_projectId_fkey') THEN
    ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ApprovalRequest_taskId_fkey') THEN
    ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ApprovalRequest_requestedByAgentId_fkey') THEN
    ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_requestedByAgentId_fkey" FOREIGN KEY ("requestedByAgentId") REFERENCES "AgentIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ApprovalRequest_decidedByAccountId_fkey') THEN
    ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_decidedByAccountId_fkey" FOREIGN KEY ("decidedByAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Blocker_workspaceId_fkey') THEN
    ALTER TABLE "Blocker" ADD CONSTRAINT "Blocker_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Blocker_projectId_fkey') THEN
    ALTER TABLE "Blocker" ADD CONSTRAINT "Blocker_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Blocker_taskId_fkey') THEN
    ALTER TABLE "Blocker" ADD CONSTRAINT "Blocker_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Blocker_ownerAgentId_fkey') THEN
    ALTER TABLE "Blocker" ADD CONSTRAINT "Blocker_ownerAgentId_fkey" FOREIGN KEY ("ownerAgentId") REFERENCES "AgentIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
