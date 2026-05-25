CREATE TABLE "TwoFactorPolicy" (
  "id" TEXT NOT NULL DEFAULT 'instance',
  "enforcementTarget" TEXT NOT NULL DEFAULT 'NONE',
  "gracePeriodDays" INTEGER NOT NULL DEFAULT 14,
  "allowRecoveryResetByAdmins" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TwoFactorPolicy_pkey" PRIMARY KEY ("id")
);
