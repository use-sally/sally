-- CreateEnum
CREATE TYPE "TaskResourceProvider" AS ENUM ('GOOGLE_DRIVE', 'MICROSOFT_365', 'DROPBOX');

-- CreateEnum
CREATE TYPE "TaskResourceKind" AS ENUM ('FILE', 'FOLDER', 'LINK');

-- CreateTable
CREATE TABLE "TaskConnectedResource" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "provider" "TaskResourceProvider" NOT NULL,
    "kind" "TaskResourceKind" NOT NULL DEFAULT 'LINK',
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "webUrl" TEXT NOT NULL,
    "mimeType" TEXT,
    "connectedByAccountId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskConnectedResource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaskConnectedResource_taskId_provider_externalId_key" ON "TaskConnectedResource"("taskId", "provider", "externalId");

-- CreateIndex
CREATE INDEX "TaskConnectedResource_taskId_idx" ON "TaskConnectedResource"("taskId");

-- CreateIndex
CREATE INDEX "TaskConnectedResource_connectedByAccountId_idx" ON "TaskConnectedResource"("connectedByAccountId");

-- AddForeignKey
ALTER TABLE "TaskConnectedResource" ADD CONSTRAINT "TaskConnectedResource_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskConnectedResource" ADD CONSTRAINT "TaskConnectedResource_connectedByAccountId_fkey" FOREIGN KEY ("connectedByAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
