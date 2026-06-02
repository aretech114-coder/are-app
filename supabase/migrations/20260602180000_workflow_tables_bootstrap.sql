-- Bootstrap tables workflow manquantes (Production partielle)
-- Corrige: Could not find the table 'public.workflow_step_responsibles' in the schema cache

-- ---------------------------------------------------------------------------
-- 1. workflow_step_responsibles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workflow_step_responsibles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  step_number integer NOT NULL,
  assignment_mode text NOT NULL DEFAULT 'default_user',
  default_user_id uuid NULL,
  fallback_step_number integer NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  notify_enabled boolean NOT NULL DEFAULT true,
  notification_subject_template text DEFAULT 'Courrier en attente — {{step_name}}',
  CONSTRAINT workflow_step_responsibles_step_number_key UNIQUE (step_number),
  CONSTRAINT workflow_step_responsibles_step_check CHECK (step_number BETWEEN 2 AND 9),
  CONSTRAINT workflow_step_responsibles_mode_check CHECK (
    assignment_mode IN ('default_user', 'default_user_with_fallback', 'dynamic_by_previous_step')
  ),
  CONSTRAINT workflow_step_responsibles_fallback_check CHECK (
    (assignment_mode = 'default_user_with_fallback' AND fallback_step_number IS NOT NULL)
    OR (assignment_mode <> 'default_user_with_fallback' AND fallback_step_number IS NULL)
  )
);

ALTER TABLE public.workflow_step_responsibles
  ADD COLUMN IF NOT EXISTS notify_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.workflow_step_responsibles
  ADD COLUMN IF NOT EXISTS notification_subject_template text DEFAULT 'Courrier en attente — {{step_name}}';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'workflow_step_responsibles_default_user_fk'
  ) THEN
    ALTER TABLE public.workflow_step_responsibles
      ADD CONSTRAINT workflow_step_responsibles_default_user_fk
      FOREIGN KEY (default_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'workflow_step_responsibles_created_by_fk'
  ) THEN
    ALTER TABLE public.workflow_step_responsibles
      ADD CONSTRAINT workflow_step_responsibles_created_by_fk
      FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_workflow_step_responsibles_default_user
  ON public.workflow_step_responsibles(default_user_id);

ALTER TABLE public.workflow_step_responsibles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workflow responsibles are readable by workflow actors" ON public.workflow_step_responsibles;
CREATE POLICY "Workflow responsibles are readable by workflow actors"
  ON public.workflow_step_responsibles FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'superadmin'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'ministre'::public.app_role)
    OR public.has_role(auth.uid(), 'directeur'::public.app_role)
    OR public.has_role(auth.uid(), 'dg'::public.app_role)
    OR public.has_role(auth.uid(), 'dircab'::public.app_role)
    OR public.has_role(auth.uid(), 'dircaba'::public.app_role)
    OR public.has_role(auth.uid(), 'secretariat'::public.app_role)
    OR public.has_role(auth.uid(), 'conseiller_juridique'::public.app_role)
    OR public.has_role(auth.uid(), 'conseiller'::public.app_role)
  );

DROP POLICY IF EXISTS "Workflow responsibles are manageable by delegated admins" ON public.workflow_step_responsibles;
CREATE POLICY "Workflow responsibles are manageable by delegated admins"
  ON public.workflow_step_responsibles FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'superadmin'::public.app_role)
    OR (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      AND EXISTS (
        SELECT 1 FROM public.admin_permissions ap
        WHERE ap.permission_key = 'manage_workflow_assignments'
          AND ap.is_enabled = true
      )
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'superadmin'::public.app_role)
    OR (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      AND EXISTS (
        SELECT 1 FROM public.admin_permissions ap
        WHERE ap.permission_key = 'manage_workflow_assignments'
          AND ap.is_enabled = true
      )
    )
  );

DROP TRIGGER IF EXISTS update_workflow_step_responsibles_updated_at ON public.workflow_step_responsibles;
CREATE TRIGGER update_workflow_step_responsibles_updated_at
  BEFORE UPDATE ON public.workflow_step_responsibles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ---------------------------------------------------------------------------
-- 2. workflow_steps — colonnes + seed 9 étapes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workflow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  step_order integer NOT NULL,
  name text NOT NULL,
  description text,
  responsible_role text,
  is_active boolean NOT NULL DEFAULT true,
  conditions jsonb DEFAULT '{}'::jsonb,
  action_labels jsonb DEFAULT '{}'::jsonb,
  assignment_mode text DEFAULT 'default_user',
  color_class text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.workflow_steps
  ADD COLUMN IF NOT EXISTS responsible_role text,
  ADD COLUMN IF NOT EXISTS action_labels jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS assignment_mode text DEFAULT 'default_user',
  ADD COLUMN IF NOT EXISTS color_class text DEFAULT '',
  ADD COLUMN IF NOT EXISTS responsible_roles text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS responsible_user_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS assignment_target text NOT NULL DEFAULT 'roles';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_available boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS unavailable_until timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS workflow_steps_step_order_unique
  ON public.workflow_steps(step_order);

ALTER TABLE public.workflow_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "SuperAdmin full access workflow" ON public.workflow_steps;
CREATE POLICY "SuperAdmin full access workflow"
  ON public.workflow_steps FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'superadmin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'superadmin'::public.app_role));

DROP POLICY IF EXISTS "Admin manage workflow" ON public.workflow_steps;
CREATE POLICY "Admin manage workflow"
  ON public.workflow_steps FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.admin_permissions
      WHERE permission_key = 'manage_workflow' AND is_enabled = true
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.admin_permissions
      WHERE permission_key = 'manage_workflow' AND is_enabled = true
    )
  );

DROP POLICY IF EXISTS "Authenticated read workflow" ON public.workflow_steps;
CREATE POLICY "Authenticated read workflow"
  ON public.workflow_steps FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

INSERT INTO public.workflow_steps (
  step_order, name, description, responsible_role, assignment_mode, color_class, is_active, conditions
) VALUES
  (1, 'Réception', 'Scan, attribution ID, saisie métadonnées', 'secretariat', 'default_user', 'bg-blue-500/10 text-blue-600 border-blue-200', true, '{}'),
  (2, 'Traitement DG', 'Orientation et instructions du Directeur général', 'directeur', 'default_user', 'bg-purple-500/10 text-purple-600 border-purple-200', true, '{}'),
  (3, 'Filtrage Stratégique', 'Validation des instructions et réaffectation', 'dircab', 'default_user', 'bg-amber-500/10 text-amber-600 border-amber-200', true, '{"skip_if_ministre_absent": true}'),
  (4, 'Traitement', 'Rédaction notes techniques ou réponses', 'conseiller_juridique', 'dynamic_by_previous_step', 'bg-emerald-500/10 text-emerald-600 border-emerald-200', true, '{}'),
  (5, 'Vérification', 'Vérification par le DirCab avant validation', 'dircab', 'default_user', 'bg-orange-500/10 text-orange-600 border-orange-200', true, '{}'),
  (6, 'Validation Ministre', 'Validation finale ou rejet par le Ministre', 'ministre', 'default_user_with_fallback', 'bg-cyan-500/10 text-cyan-600 border-cyan-200', true, '{}'),
  (7, 'Consultation Conseillers', 'Consultation de la validation de la note technique', 'conseiller_juridique', 'dynamic_by_previous_step', 'bg-teal-500/10 text-teal-600 border-teal-200', true, '{"skip_if_not_note_technique": true}'),
  (8, 'Retour & Preuve de Dépôt', 'Retour du document avec preuve de dépôt et scan', 'secretariat', 'default_user', 'bg-indigo-500/10 text-indigo-600 border-indigo-200', true, '{}'),
  (9, 'Archivage Final', 'Clôture définitive et transfert au dépôt central', 'secretariat', 'default_user', 'bg-slate-500/10 text-slate-600 border-slate-200', true, '{}')
ON CONFLICT (step_order) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  responsible_role = EXCLUDED.responsible_role,
  assignment_mode = EXCLUDED.assignment_mode,
  color_class = EXCLUDED.color_class,
  conditions = EXCLUDED.conditions;

UPDATE public.workflow_steps
SET responsible_roles = ARRAY[responsible_role]
WHERE responsible_role IS NOT NULL
  AND responsible_role <> ''
  AND (responsible_roles IS NULL OR array_length(responsible_roles, 1) IS NULL);

-- ---------------------------------------------------------------------------
-- 3. workflow_step_fallbacks (page Workflow — cascade suppléants)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workflow_step_fallbacks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id uuid NOT NULL REFERENCES public.workflow_steps(id) ON DELETE CASCADE,
  condition_key text NOT NULL,
  fallback_user_ids uuid[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(step_id, condition_key)
);

ALTER TABLE public.workflow_step_fallbacks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "SuperAdmin full access fallbacks" ON public.workflow_step_fallbacks;
CREATE POLICY "SuperAdmin full access fallbacks"
  ON public.workflow_step_fallbacks FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'superadmin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'superadmin'::public.app_role));

DROP POLICY IF EXISTS "Admin manage fallbacks with permission" ON public.workflow_step_fallbacks;
CREATE POLICY "Admin manage fallbacks with permission"
  ON public.workflow_step_fallbacks FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.admin_permissions ap
      WHERE ap.permission_key = 'manage_workflow_assignments' AND ap.is_enabled = true
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.admin_permissions ap
      WHERE ap.permission_key = 'manage_workflow_assignments' AND ap.is_enabled = true
    )
  );

DROP POLICY IF EXISTS "Workflow actors read fallbacks" ON public.workflow_step_fallbacks;
CREATE POLICY "Workflow actors read fallbacks"
  ON public.workflow_step_fallbacks FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'superadmin'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'ministre'::public.app_role)
    OR public.has_role(auth.uid(), 'directeur'::public.app_role)
    OR public.has_role(auth.uid(), 'dircab'::public.app_role)
    OR public.has_role(auth.uid(), 'dircaba'::public.app_role)
    OR public.has_role(auth.uid(), 'secretariat'::public.app_role)
  );

-- ---------------------------------------------------------------------------
-- 4. sla_config — seed si vide
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sla_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  step_number integer NOT NULL UNIQUE,
  step_name text NOT NULL,
  default_hours integer NOT NULL DEFAULT 48,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.sla_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read sla" ON public.sla_config;
CREATE POLICY "Authenticated read sla"
  ON public.sla_config FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admin manage sla" ON public.sla_config;
CREATE POLICY "Admin manage sla"
  ON public.sla_config FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'superadmin'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'superadmin'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

INSERT INTO public.sla_config (step_number, step_name, default_hours, description) VALUES
  (1, 'Réception', 24, 'Scan, attribution ID, saisie métadonnées'),
  (2, 'Traitement DG', 24, 'Orientation et instructions du Directeur général'),
  (3, 'Filtrage Stratégique', 48, 'Validation des instructions et réaffectation'),
  (4, 'Traitement', 72, 'Rédaction notes techniques ou réponses'),
  (5, 'Vérification', 48, 'Vérification par le DirCab'),
  (6, 'Validation Ministre', 48, 'Validation finale ou rejet'),
  (7, 'Consultation Conseillers', 48, 'Consultation note technique'),
  (8, 'Retour & Preuve de Dépôt', 24, 'Retour document et scan'),
  (9, 'Archivage Final', 24, 'Clôture définitive')
ON CONFLICT (step_number) DO UPDATE SET
  step_name = EXCLUDED.step_name,
  default_hours = EXCLUDED.default_hours,
  description = EXCLUDED.description;

-- ---------------------------------------------------------------------------
-- 5. Permissions admin manquantes
-- ---------------------------------------------------------------------------
INSERT INTO public.admin_permissions (permission_key, label, description, is_enabled)
VALUES
  ('manage_workflow_assignments', 'Gérer les responsables workflow', 'Configurer les responsables par étape et les fallbacks', true),
  ('impersonate_users', 'Impersonner des utilisateurs', 'Ouvrir une session en tant qu''un autre utilisateur', true)
ON CONFLICT (permission_key) DO NOTHING;

GRANT EXECUTE ON FUNCTION public.resolve_step_assignee(integer, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
