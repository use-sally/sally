CREATE TABLE "AuditLogPolicy" (
  "id" TEXT NOT NULL DEFAULT 'instance',
  "retentionDays" INTEGER NOT NULL DEFAULT 365,
  "exportRequiresAdmin" BOOLEAN NOT NULL DEFAULT true,
  "includeAuthEvents" BOOLEAN NOT NULL DEFAULT true,
  "includeAutomationEvents" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AuditLogPolicy_pkey" PRIMARY KEY ("id")
);
