ALTER TABLE "InstalledLicense" ADD COLUMN "lastRefreshError" TEXT;
ALTER TABLE "InstalledLicense" ADD COLUMN "nextRefreshAt" TIMESTAMP(3);
