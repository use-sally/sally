CREATE TABLE "SamlIdentityProvider" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "entityId" TEXT NOT NULL,
  "ssoUrl" TEXT NOT NULL,
  "certificate" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "enforceSso" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SamlIdentityProvider_pkey" PRIMARY KEY ("id")
);
