CREATE TABLE "SamlAuthRequest" (
  "id" TEXT NOT NULL,
  "relayState" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SamlAuthRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SamlAuthRequest_relayState_key" ON "SamlAuthRequest"("relayState");
CREATE INDEX "SamlAuthRequest_expiresAt_idx" ON "SamlAuthRequest"("expiresAt");
