-- CreateTable
CREATE TABLE "AccountIntegration" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "provider" "TaskResourceProvider" NOT NULL,
    "accessTokenEnc" TEXT NOT NULL,
    "refreshTokenEnc" TEXT,
    "expiresAt" TIMESTAMP(3),
    "scopes" TEXT,
    "externalAccountId" TEXT,
    "externalEmail" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountIntegration_accountId_provider_key" ON "AccountIntegration"("accountId", "provider");

-- CreateIndex
CREATE INDEX "AccountIntegration_provider_idx" ON "AccountIntegration"("provider");

-- AddForeignKey
ALTER TABLE "AccountIntegration" ADD CONSTRAINT "AccountIntegration_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
