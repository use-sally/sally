-- Add the explicit plan-first workflow stage used before execution jobs begin.
ALTER TYPE "WorkflowStage" ADD VALUE IF NOT EXISTS 'PLANNING';
