-- CreateTable
CREATE TABLE "AuditLogEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "actorAccountId" TEXT,
    "projectId" TEXT,
    "taskId" TEXT,
    "agentId" TEXT,
    "agentJobId" TEXT,
    "agentRunId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "summary" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLogEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLogEvent_workspaceId_createdAt_idx" ON "AuditLogEvent"("workspaceId", "createdAt");
CREATE INDEX "AuditLogEvent_actorAccountId_createdAt_idx" ON "AuditLogEvent"("actorAccountId", "createdAt");
CREATE INDEX "AuditLogEvent_action_createdAt_idx" ON "AuditLogEvent"("action", "createdAt");
CREATE INDEX "AuditLogEvent_targetType_targetId_createdAt_idx" ON "AuditLogEvent"("targetType", "targetId", "createdAt");
CREATE INDEX "AuditLogEvent_projectId_createdAt_idx" ON "AuditLogEvent"("projectId", "createdAt");
CREATE INDEX "AuditLogEvent_taskId_createdAt_idx" ON "AuditLogEvent"("taskId", "createdAt");

-- AddForeignKey
ALTER TABLE "AuditLogEvent" ADD CONSTRAINT "AuditLogEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditLogEvent" ADD CONSTRAINT "AuditLogEvent_actorAccountId_fkey" FOREIGN KEY ("actorAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditLogEvent" ADD CONSTRAINT "AuditLogEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditLogEvent" ADD CONSTRAINT "AuditLogEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditLogEvent" ADD CONSTRAINT "AuditLogEvent_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AgentIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditLogEvent" ADD CONSTRAINT "AuditLogEvent_agentJobId_fkey" FOREIGN KEY ("agentJobId") REFERENCES "AgentJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditLogEvent" ADD CONSTRAINT "AuditLogEvent_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
