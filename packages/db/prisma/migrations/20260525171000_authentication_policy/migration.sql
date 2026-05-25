CREATE TABLE "AuthenticationPolicy" (
  "id" TEXT NOT NULL DEFAULT 'instance',
  "minimumPasswordLength" INTEGER NOT NULL DEFAULT 12,
  "requirePasswordUppercase" BOOLEAN NOT NULL DEFAULT true,
  "requirePasswordLowercase" BOOLEAN NOT NULL DEFAULT true,
  "requirePasswordNumber" BOOLEAN NOT NULL DEFAULT true,
  "requirePasswordSymbol" BOOLEAN NOT NULL DEFAULT true,
  "disablePasswordLoginForSso" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AuthenticationPolicy_pkey" PRIMARY KEY ("id")
);
