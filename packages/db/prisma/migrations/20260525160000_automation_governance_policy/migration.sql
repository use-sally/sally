CREATE TABLE "AutomationGovernancePolicy" (
  "id" TEXT NOT NULL DEFAULT 'instance',
  "allowedRuntimeTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "workflowStartRoles" TEXT[] NOT NULL DEFAULT ARRAY['OWNER','MEMBER']::TEXT[],
  "maxConcurrentWorkflowJobs" INTEGER NOT NULL DEFAULT 1,
  "workflowStartRequiresApproval" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AutomationGovernancePolicy_pkey" PRIMARY KEY ("id")
);
