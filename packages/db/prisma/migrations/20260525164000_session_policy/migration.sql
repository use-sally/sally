CREATE TABLE "SessionPolicy" (
  "id" TEXT NOT NULL DEFAULT 'instance',
  "maxSessionLifetimeDays" INTEGER NOT NULL DEFAULT 30,
  "revokeOnPolicyChange" BOOLEAN NOT NULL DEFAULT false,
  "restrictSessionPolicyToAdmins" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SessionPolicy_pkey" PRIMARY KEY ("id")
);
