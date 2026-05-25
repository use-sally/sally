CREATE TABLE "AccountWebAuthnCredential" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "credentialId" TEXT NOT NULL,
  "publicKey" BYTEA NOT NULL,
  "counter" BIGINT NOT NULL DEFAULT 0,
  "deviceType" TEXT,
  "backedUp" BOOLEAN NOT NULL DEFAULT false,
  "transports" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "label" TEXT,
  "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AccountWebAuthnCredential_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountWebAuthnChallenge" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "challenge" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AccountWebAuthnChallenge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountWebAuthnCredential_credentialId_key" ON "AccountWebAuthnCredential"("credentialId");
CREATE INDEX "AccountWebAuthnCredential_accountId_idx" ON "AccountWebAuthnCredential"("accountId");
CREATE UNIQUE INDEX "AccountWebAuthnChallenge_token_key" ON "AccountWebAuthnChallenge"("token");
CREATE INDEX "AccountWebAuthnChallenge_accountId_idx" ON "AccountWebAuthnChallenge"("accountId");
CREATE INDEX "AccountWebAuthnChallenge_expiresAt_idx" ON "AccountWebAuthnChallenge"("expiresAt");

ALTER TABLE "AccountWebAuthnCredential" ADD CONSTRAINT "AccountWebAuthnCredential_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountWebAuthnChallenge" ADD CONSTRAINT "AccountWebAuthnChallenge_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
