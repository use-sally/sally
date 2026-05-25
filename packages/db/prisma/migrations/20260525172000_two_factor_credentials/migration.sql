CREATE TABLE "AccountTwoFactorCredential" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "secret" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "confirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AccountTwoFactorCredential_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountTwoFactorChallenge" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AccountTwoFactorChallenge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountTwoFactorCredential_accountId_key" ON "AccountTwoFactorCredential"("accountId");
CREATE UNIQUE INDEX "AccountTwoFactorChallenge_token_key" ON "AccountTwoFactorChallenge"("token");
CREATE INDEX "AccountTwoFactorChallenge_accountId_idx" ON "AccountTwoFactorChallenge"("accountId");
CREATE INDEX "AccountTwoFactorChallenge_expiresAt_idx" ON "AccountTwoFactorChallenge"("expiresAt");

ALTER TABLE "AccountTwoFactorCredential" ADD CONSTRAINT "AccountTwoFactorCredential_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountTwoFactorChallenge" ADD CONSTRAINT "AccountTwoFactorChallenge_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
