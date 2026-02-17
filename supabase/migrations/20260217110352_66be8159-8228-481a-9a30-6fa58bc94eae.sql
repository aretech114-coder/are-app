
-- Admin permissions table (SuperAdmin controls what Admin can do)
CREATE TABLE public.admin_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permission_key text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.admin_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SuperAdmin full access" ON public.admin_permissions
  FOR ALL USING (public.has_role(auth.uid(), 'superadmin'));

CREATE POLICY "Admin can read permissions" ON public.admin_permissions
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- Seed default permissions
INSERT INTO public.admin_permissions (permission_key, label, description, is_enabled) VALUES
  ('manage_users', 'Gérer les utilisateurs', 'Créer, modifier et supprimer des utilisateurs', true),
  ('manage_workflow', 'Gérer le workflow', 'Définir les étapes du circuit de traitement', true),
  ('manage_custom_fields', 'Gérer les champs personnalisés', 'Créer des fiches de courrier dynamiques', true),
  ('view_all_analytics', 'Voir toutes les statistiques', 'Accès complet aux tableaux de bord', true),
  ('manage_archive', 'Gérer les archives', 'Accès complet aux archives centrales', true),
  ('reset_passwords', 'Réinitialiser les mots de passe', 'Réinitialiser les mots de passe des utilisateurs', true);

-- Workflow steps table
CREATE TABLE public.workflow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  step_order int NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  conditions jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.workflow_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SuperAdmin full access workflow" ON public.workflow_steps
  FOR ALL USING (public.has_role(auth.uid(), 'superadmin'));

CREATE POLICY "Admin manage workflow" ON public.workflow_steps
  FOR ALL USING (
    public.has_role(auth.uid(), 'admin')
    AND EXISTS (SELECT 1 FROM public.admin_permissions WHERE permission_key = 'manage_workflow' AND is_enabled = true)
  );

CREATE POLICY "Authenticated read workflow" ON public.workflow_steps
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Seed default workflow steps
INSERT INTO public.workflow_steps (name, step_order, description) VALUES
  ('Enregistrement', 1, 'Réception et enregistrement du courrier'),
  ('Scan', 2, 'Numérisation du document'),
  ('Assignation', 3, 'Attribution à un agent traitant'),
  ('Traitement', 4, 'Traitement du courrier par l''agent'),
  ('Archivage', 5, 'Classement en archive centrale');

-- Custom fields table (Form Builder)
CREATE TABLE public.custom_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_name text NOT NULL,
  field_label text NOT NULL,
  field_type text NOT NULL DEFAULT 'text',
  field_options jsonb DEFAULT '[]',
  is_required boolean NOT NULL DEFAULT false,
  display_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.custom_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SuperAdmin full access fields" ON public.custom_fields
  FOR ALL USING (public.has_role(auth.uid(), 'superadmin'));

CREATE POLICY "Admin manage fields" ON public.custom_fields
  FOR ALL USING (
    public.has_role(auth.uid(), 'admin')
    AND EXISTS (SELECT 1 FROM public.admin_permissions WHERE permission_key = 'manage_custom_fields' AND is_enabled = true)
  );

CREATE POLICY "Authenticated read fields" ON public.custom_fields
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Updated_at triggers
CREATE TRIGGER update_admin_permissions_updated_at
  BEFORE UPDATE ON public.admin_permissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_workflow_steps_updated_at
  BEFORE UPDATE ON public.workflow_steps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_custom_fields_updated_at
  BEFORE UPDATE ON public.custom_fields
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
