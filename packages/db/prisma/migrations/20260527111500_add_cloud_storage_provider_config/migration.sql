-- CreateTable
CREATE TABLE "CloudStorageProviderConfig" (
    "provider" "TaskResourceProvider" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "clientId" TEXT,
    "clientSecretEnc" TEXT,
    "tenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CloudStorageProviderConfig_pkey" PRIMARY KEY ("provider")
);
