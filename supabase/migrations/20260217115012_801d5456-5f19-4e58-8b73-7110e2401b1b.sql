
-- Step 2: Create workflow tables and update mails

-- Add workflow columns to mails
ALTER TABLE mails ADD COLUMN IF NOT EXISTS current_step integer DEFAULT 1;
ALTER TABLE mails ADD COLUMN IF NOT EXISTS deadline_at timestamptz;
ALTER TABLE mails ADD COLUMN IF NOT EXISTS mail_type text DEFAULT 'standard';
ALTER TABLE mails ADD COLUMN IF NOT EXISTS workflow_started_at timestamptz DEFAULT now();
ALTER TABLE mails ADD COLUMN IF NOT EXISTS workflow_completed_at timestamptz;

-- Mail assignments (multi-assignment for Step 4)
CREATE TABLE public.mail_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mail_id uuid REFERENCES mails(id) ON DELETE CASCADE NOT NULL,
  assigned_to uuid NOT NULL,
  assigned_by uuid NOT NULL,
  step_number integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  instructions text,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);
ALTER TABLE public.mail_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own assignments" ON mail_assignments FOR SELECT USING (assigned_to = auth.uid());
CREATE POLICY "Admins see all assignments" ON mail_assignments FOR SELECT USING (
  has_role(auth.uid(), 'superadmin'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'dircab'::app_role)
);
CREATE POLICY "Authorized users can insert" ON mail_assignments FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Assigned users can update" ON mail_assignments FOR UPDATE USING (assigned_to = auth.uid() OR assigned_by = auth.uid());
CREATE POLICY "Admins can delete assignments" ON mail_assignments FOR DELETE USING (
  has_role(auth.uid(), 'superadmin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)
);

-- Workflow transitions log
CREATE TABLE public.workflow_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mail_id uuid REFERENCES mails(id) ON DELETE CASCADE NOT NULL,
  from_step integer,
  to_step integer NOT NULL,
  action text NOT NULL,
  performed_by uuid NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.workflow_transitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read transitions" ON workflow_transitions FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated insert transitions" ON workflow_transitions FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- SLA configuration table
CREATE TABLE public.sla_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  step_number integer NOT NULL UNIQUE,
  step_name text NOT NULL,
  default_hours integer NOT NULL DEFAULT 48,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.sla_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read sla" ON sla_config FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admin manage sla" ON sla_config FOR ALL USING (
  has_role(auth.uid(), 'superadmin'::app_role) OR has_role(auth.uid(), 'admin'::app_role)
);

-- Seed 7 workflow steps
INSERT INTO sla_config (step_number, step_name, default_hours, description) VALUES
  (1, 'Réception (Secrétariat)', 24, 'Scan, attribution ID, saisie métadonnées'),
  (2, 'Routage Hiérarchique', 24, 'Dispatch: Ministre → Dircab → Dircaba → Conseiller Juridique'),
  (3, 'Filtrage Stratégique (Dircab)', 48, 'Validation des instructions et réaffectation'),
  (4, 'Traitement (Conseillers)', 72, 'Rédaction notes techniques ou réponses'),
  (5, 'Validation (Dircab)', 48, 'Approbation ou renvoi à étape 4'),
  (6, 'Action Finale', 48, '6A: Accusé de réception / 6B: Note technique Ministre'),
  (7, 'Archivage Final', 24, 'Clôture automatique et transfert dépôt central');

-- Triggers
CREATE TRIGGER update_sla_config_updated_at BEFORE UPDATE ON sla_config FOR EACH ROW EXECUTE FUNCTION update_updated_at();
