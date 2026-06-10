CREATE TYPE "CrmDealStatus" AS ENUM ('OPEN', 'WON', 'LOST');
CREATE TYPE "CrmActivityType" AS ENUM ('NOTE', 'CALL', 'EMAIL', 'MEETING', 'FOLLOW_UP');

CREATE TABLE "CrmOrganization" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "website" TEXT,
  "notes" TEXT,
  "labels" JSONB,
  "ownerId" TEXT,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmOrganization_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CrmPerson" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "organizationId" TEXT,
  "name" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "title" TEXT,
  "notes" TEXT,
  "labels" JSONB,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmPerson_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CrmDeal" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "organizationId" TEXT,
  "primaryPersonId" TEXT,
  "ownerId" TEXT,
  "projectId" TEXT,
  "title" TEXT NOT NULL,
  "value" INTEGER,
  "currency" TEXT,
  "stage" TEXT,
  "status" "CrmDealStatus" NOT NULL DEFAULT 'OPEN',
  "expectedCloseAt" TIMESTAMP(3),
  "notes" TEXT,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmDeal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CrmActivity" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "organizationId" TEXT,
  "personId" TEXT,
  "dealId" TEXT,
  "actorId" TEXT,
  "taskId" TEXT,
  "type" "CrmActivityType" NOT NULL DEFAULT 'NOTE',
  "body" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmActivity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CrmOrganization_workspaceId_archivedAt_idx" ON "CrmOrganization"("workspaceId", "archivedAt");
CREATE INDEX "CrmOrganization_workspaceId_name_idx" ON "CrmOrganization"("workspaceId", "name");
CREATE INDEX "CrmOrganization_ownerId_idx" ON "CrmOrganization"("ownerId");
CREATE INDEX "CrmPerson_workspaceId_archivedAt_idx" ON "CrmPerson"("workspaceId", "archivedAt");
CREATE INDEX "CrmPerson_workspaceId_name_idx" ON "CrmPerson"("workspaceId", "name");
CREATE INDEX "CrmPerson_workspaceId_email_idx" ON "CrmPerson"("workspaceId", "email");
CREATE INDEX "CrmPerson_organizationId_idx" ON "CrmPerson"("organizationId");
CREATE INDEX "CrmDeal_workspaceId_archivedAt_idx" ON "CrmDeal"("workspaceId", "archivedAt");
CREATE INDEX "CrmDeal_workspaceId_status_idx" ON "CrmDeal"("workspaceId", "status");
CREATE INDEX "CrmDeal_organizationId_idx" ON "CrmDeal"("organizationId");
CREATE INDEX "CrmDeal_primaryPersonId_idx" ON "CrmDeal"("primaryPersonId");
CREATE INDEX "CrmDeal_ownerId_idx" ON "CrmDeal"("ownerId");
CREATE INDEX "CrmDeal_projectId_idx" ON "CrmDeal"("projectId");
CREATE INDEX "CrmActivity_workspaceId_occurredAt_idx" ON "CrmActivity"("workspaceId", "occurredAt");
CREATE INDEX "CrmActivity_organizationId_idx" ON "CrmActivity"("organizationId");
CREATE INDEX "CrmActivity_personId_idx" ON "CrmActivity"("personId");
CREATE INDEX "CrmActivity_dealId_idx" ON "CrmActivity"("dealId");
CREATE INDEX "CrmActivity_actorId_idx" ON "CrmActivity"("actorId");
CREATE INDEX "CrmActivity_taskId_idx" ON "CrmActivity"("taskId");

ALTER TABLE "CrmOrganization" ADD CONSTRAINT "CrmOrganization_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmOrganization" ADD CONSTRAINT "CrmOrganization_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmPerson" ADD CONSTRAINT "CrmPerson_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmPerson" ADD CONSTRAINT "CrmPerson_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "CrmOrganization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmDeal" ADD CONSTRAINT "CrmDeal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmDeal" ADD CONSTRAINT "CrmDeal_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "CrmOrganization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmDeal" ADD CONSTRAINT "CrmDeal_primaryPersonId_fkey" FOREIGN KEY ("primaryPersonId") REFERENCES "CrmPerson"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmDeal" ADD CONSTRAINT "CrmDeal_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmDeal" ADD CONSTRAINT "CrmDeal_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "CrmOrganization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_personId_fkey" FOREIGN KEY ("personId") REFERENCES "CrmPerson"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "CrmDeal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
