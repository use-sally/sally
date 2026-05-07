-- Add an editable platform admin role below the configured SUPERADMIN.
ALTER TYPE "PlatformRole" ADD VALUE IF NOT EXISTS 'ADMIN';
