CREATE TABLE "TaskCollaborator" (
  "taskId" TEXT NOT NULL,
  "collaborator" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TaskCollaborator_pkey" PRIMARY KEY ("taskId","collaborator")
);

ALTER TABLE "TaskCollaborator"
ADD CONSTRAINT "TaskCollaborator_taskId_fkey"
FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
