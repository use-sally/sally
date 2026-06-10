ALTER TABLE "CrmOrganization" ADD COLUMN "email" TEXT;
ALTER TABLE "CrmOrganization" ADD COLUMN "phone" TEXT;
ALTER TABLE "CrmOrganization" ADD COLUMN "industry" TEXT;
ALTER TABLE "CrmOrganization" ADD COLUMN "size" TEXT;
ALTER TABLE "CrmOrganization" ADD COLUMN "source" TEXT;
ALTER TABLE "CrmOrganization" ADD COLUMN "address" TEXT;
ALTER TABLE "CrmOrganization" ADD COLUMN "city" TEXT;
ALTER TABLE "CrmOrganization" ADD COLUMN "region" TEXT;
ALTER TABLE "CrmOrganization" ADD COLUMN "postalCode" TEXT;
ALTER TABLE "CrmOrganization" ADD COLUMN "country" TEXT;

ALTER TABLE "CrmPerson" ADD COLUMN "mobile" TEXT;
ALTER TABLE "CrmPerson" ADD COLUMN "linkedinUrl" TEXT;
ALTER TABLE "CrmPerson" ADD COLUMN "source" TEXT;

ALTER TABLE "CrmDeal" ADD COLUMN "probability" INTEGER;
ALTER TABLE "CrmDeal" ADD COLUMN "nextStep" TEXT;
