ALTER TABLE "SamlIdentityProvider" ADD COLUMN "allowedDomains" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "SamlIdentityProvider" ADD COLUMN "jitProvisioning" BOOLEAN NOT NULL DEFAULT false;
