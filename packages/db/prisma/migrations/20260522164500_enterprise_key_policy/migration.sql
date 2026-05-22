-- Enterprise key policy baseline: key expiry and explicit scopes.
ALTER TABLE "AccountApiKey" ADD COLUMN "scopes" TEXT[] NOT NULL DEFAULT ARRAY['read', 'write']::TEXT[];
ALTER TABLE "AccountApiKey" ADD COLUMN "expiresAt" TIMESTAMP(3);

ALTER TABLE "AccountMcpKey" ADD COLUMN "scopes" TEXT[] NOT NULL DEFAULT ARRAY['read', 'write', 'mcp']::TEXT[];
ALTER TABLE "AccountMcpKey" ADD COLUMN "expiresAt" TIMESTAMP(3);

CREATE INDEX "AccountApiKey_expiresAt_idx" ON "AccountApiKey"("expiresAt");
CREATE INDEX "AccountMcpKey_expiresAt_idx" ON "AccountMcpKey"("expiresAt");
