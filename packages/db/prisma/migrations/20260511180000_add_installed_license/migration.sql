CREATE TABLE "InstalledLicense" (
    "id" TEXT NOT NULL DEFAULT 'instance',
    "licenseServerUrl" TEXT NOT NULL,
    "certificate" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "activationId" TEXT,
    "licenseId" TEXT,
    "instanceId" TEXT,
    "status" TEXT,
    "validUntil" TIMESTAMP(3),
    "graceUntil" TIMESTAMP(3),
    "lastRefreshAt" TIMESTAMP(3),
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstalledLicense_pkey" PRIMARY KEY ("id")
);
