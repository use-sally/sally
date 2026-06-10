CREATE TYPE "CrmFollowUpStatus" AS ENUM ('OPEN', 'DONE', 'CANCELLED');

CREATE TABLE "CrmFollowUp" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "organizationId" TEXT,
  "personId" TEXT,
  "dealId" TEXT,
  "ownerId" TEXT,
  "createdById" TEXT,
  "title" TEXT NOT NULL,
  "body" TEXT,
  "status" "CrmFollowUpStatus" NOT NULL DEFAULT 'OPEN',
  "dueAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmFollowUp_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CrmFollowUp_workspaceId_status_dueAt_idx" ON "CrmFollowUp"("workspaceId", "status", "dueAt");
CREATE INDEX "CrmFollowUp_organizationId_idx" ON "CrmFollowUp"("organizationId");
CREATE INDEX "CrmFollowUp_personId_idx" ON "CrmFollowUp"("personId");
CREATE INDEX "CrmFollowUp_dealId_idx" ON "CrmFollowUp"("dealId");
CREATE INDEX "CrmFollowUp_ownerId_idx" ON "CrmFollowUp"("ownerId");
CREATE INDEX "CrmFollowUp_createdById_idx" ON "CrmFollowUp"("createdById");

ALTER TABLE "CrmFollowUp" ADD CONSTRAINT "CrmFollowUp_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmFollowUp" ADD CONSTRAINT "CrmFollowUp_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "CrmOrganization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmFollowUp" ADD CONSTRAINT "CrmFollowUp_personId_fkey" FOREIGN KEY ("personId") REFERENCES "CrmPerson"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmFollowUp" ADD CONSTRAINT "CrmFollowUp_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "CrmDeal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmFollowUp" ADD CONSTRAINT "CrmFollowUp_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmFollowUp" ADD CONSTRAINT "CrmFollowUp_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
