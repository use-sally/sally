CREATE TABLE "ApiMcpKeyPolicy" (
  "id" TEXT NOT NULL DEFAULT 'instance',
  "requireApiKeyExpiry" BOOLEAN NOT NULL DEFAULT false,
  "requireMcpKeyExpiry" BOOLEAN NOT NULL DEFAULT false,
  "apiKeyDefaultExpiresInDays" INTEGER,
  "apiKeyMaxExpiresInDays" INTEGER,
  "mcpKeyDefaultExpiresInDays" INTEGER,
  "mcpKeyMaxExpiresInDays" INTEGER,
  "restrictApiKeyCreationToAdmins" BOOLEAN NOT NULL DEFAULT false,
  "restrictMcpKeyCreationToAdmins" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ApiMcpKeyPolicy_pkey" PRIMARY KEY ("id")
);
