-- Add secure outbound agent connector primitives.
CREATE TYPE "AgentConnectionStatus" AS ENUM ('ONLINE', 'OFFLINE', 'DEGRADED', 'REVOKED');

CREATE TABLE "AgentConnection" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "agentId" TEXT,
    "name" TEXT NOT NULL,
    "runtimeType" TEXT NOT NULL,
    "runtimeVersion" TEXT,
    "profileRef" TEXT,
    "status" "AgentConnectionStatus" NOT NULL DEFAULT 'OFFLINE',
    "capabilities" JSONB,
    "tokenPrefix" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AgentConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentPairingCode" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "agentId" TEXT,
    "codeHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "runtimeType" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentPairingCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "agentId" TEXT,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentEventAck" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "lastEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AgentEventAck_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentConnection_tokenHash_key" ON "AgentConnection"("tokenHash");
CREATE INDEX "AgentConnection_workspaceId_status_updatedAt_idx" ON "AgentConnection"("workspaceId", "status", "updatedAt");
CREATE INDEX "AgentConnection_workspaceId_agentId_idx" ON "AgentConnection"("workspaceId", "agentId");
CREATE INDEX "AgentConnection_revokedAt_idx" ON "AgentConnection"("revokedAt");

CREATE UNIQUE INDEX "AgentPairingCode_codeHash_key" ON "AgentPairingCode"("codeHash");
CREATE INDEX "AgentPairingCode_workspaceId_expiresAt_idx" ON "AgentPairingCode"("workspaceId", "expiresAt");
CREATE INDEX "AgentPairingCode_agentId_idx" ON "AgentPairingCode"("agentId");

CREATE INDEX "AgentEvent_workspaceId_id_idx" ON "AgentEvent"("workspaceId", "id");
CREATE INDEX "AgentEvent_workspaceId_type_createdAt_idx" ON "AgentEvent"("workspaceId", "type", "createdAt");
CREATE INDEX "AgentEvent_agentId_createdAt_idx" ON "AgentEvent"("agentId", "createdAt");

CREATE UNIQUE INDEX "AgentEventAck_connectionId_key" ON "AgentEventAck"("connectionId");
CREATE INDEX "AgentEventAck_workspaceId_updatedAt_idx" ON "AgentEventAck"("workspaceId", "updatedAt");

ALTER TABLE "AgentConnection" ADD CONSTRAINT "AgentConnection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentConnection" ADD CONSTRAINT "AgentConnection_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AgentIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentPairingCode" ADD CONSTRAINT "AgentPairingCode_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentPairingCode" ADD CONSTRAINT "AgentPairingCode_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AgentIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentEvent" ADD CONSTRAINT "AgentEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentEventAck" ADD CONSTRAINT "AgentEventAck_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentEventAck" ADD CONSTRAINT "AgentEventAck_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "AgentConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
