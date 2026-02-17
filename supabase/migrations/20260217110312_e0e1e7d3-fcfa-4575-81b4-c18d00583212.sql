
-- Step 1: Add superadmin to enum only
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'superadmin' BEFORE 'admin';
