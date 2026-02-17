
-- Step 1: Add new ministerial roles to app_role enum
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'ministre';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'dircab';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'dircaba';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'conseiller_juridique';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'secretariat';

-- Create enums
CREATE TYPE mail_type AS ENUM ('standard', 'invitation', 'note_technique', 'accusé_reception');
CREATE TYPE workflow_action AS ENUM ('approve', 'reject', 'reassign', 'escalate', 'complete', 'archive');
