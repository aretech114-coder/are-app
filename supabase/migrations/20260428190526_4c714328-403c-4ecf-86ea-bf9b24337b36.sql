-- Bloc 1 : extension workflow_steps
ALTER TABLE public.workflow_steps
  ADD COLUMN IF NOT EXISTS responsible_roles text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS responsible_user_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS assignment_target text NOT NULL DEFAULT 'roles';

-- Backfill : copier responsible_role existant dans responsible_roles
UPDATE public.workflow_steps
SET responsible_roles = ARRAY[responsible_role]
WHERE responsible_role IS NOT NULL
  AND responsible_role <> ''
  AND (responsible_roles IS NULL OR array_length(responsible_roles, 1) IS NULL);

-- Validation assignment_target
ALTER TABLE public.workflow_steps
  DROP CONSTRAINT IF EXISTS workflow_steps_assignment_target_check;
ALTER TABLE public.workflow_steps
  ADD CONSTRAINT workflow_steps_assignment_target_check
  CHECK (assignment_target IN ('roles', 'users', 'mixed'));

-- Bloc 2.a : disponibilité utilisateur
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_available boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS unavailable_until timestamptz;

-- Bloc 2.b : table des fallbacks
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

-- Trigger limitant la cascade à 5 utilisateurs
CREATE OR REPLACE FUNCTION public.validate_fallback_cascade()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.fallback_user_ids IS NULL THEN
    NEW.fallback_user_ids := '{}';
  END IF;

  IF array_length(NEW.fallback_user_ids, 1) > 5 THEN
    RAISE EXCEPTION 'La cascade de fallbacks ne peut pas dépasser 5 utilisateurs.';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_fallback_cascade ON public.workflow_step_fallbacks;
CREATE TRIGGER trg_validate_fallback_cascade
  BEFORE INSERT OR UPDATE ON public.workflow_step_fallbacks
  FOR EACH ROW EXECUTE FUNCTION public.validate_fallback_cascade();

-- RLS workflow_step_fallbacks
DROP POLICY IF EXISTS "SuperAdmin full access fallbacks" ON public.workflow_step_fallbacks;
CREATE POLICY "SuperAdmin full access fallbacks"
  ON public.workflow_step_fallbacks FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'superadmin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'superadmin'::app_role));

DROP POLICY IF EXISTS "Admin manage fallbacks with permission" ON public.workflow_step_fallbacks;
CREATE POLICY "Admin manage fallbacks with permission"
  ON public.workflow_step_fallbacks FOR ALL TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.admin_permissions ap
      WHERE ap.permission_key = 'manage_workflow_assignments' AND ap.is_enabled = true
    )
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.admin_permissions ap
      WHERE ap.permission_key = 'manage_workflow_assignments' AND ap.is_enabled = true
    )
  );

DROP POLICY IF EXISTS "Workflow actors read fallbacks" ON public.workflow_step_fallbacks;
CREATE POLICY "Workflow actors read fallbacks"
  ON public.workflow_step_fallbacks FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'superadmin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'ministre'::app_role)
    OR has_role(auth.uid(), 'dircab'::app_role)
    OR has_role(auth.uid(), 'dircaba'::app_role)
    OR has_role(auth.uid(), 'secretariat'::app_role)
    OR has_role(auth.uid(), 'dg'::app_role)
    OR has_role(auth.uid(), 'dga'::app_role)
    OR has_role(auth.uid(), 'daf'::app_role)
    OR has_role(auth.uid(), 'dt'::app_role)
  );

-- Refonte resolve_step_assignee : intègre nouvelle priorité (users > roles > config existante)
CREATE OR REPLACE FUNCTION public.resolve_step_assignee(_step_number integer, _mail_id uuid DEFAULT NULL::uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_step workflow_steps%ROWTYPE;
  v_default_user uuid;
  v_mode text;
  v_fallback_step integer;
  v_fallback_user uuid;
  v_candidate uuid;
  v_role text;
BEGIN
  -- 1. Lecture de l'étape
  SELECT * INTO v_step
  FROM public.workflow_steps
  WHERE step_order = _step_number AND is_active = true
  LIMIT 1;

  -- 2. Priorité 1 : utilisateurs nominatifs (premier dispo)
  IF v_step.responsible_user_ids IS NOT NULL
     AND array_length(v_step.responsible_user_ids, 1) > 0
     AND v_step.assignment_target IN ('users', 'mixed') THEN
    SELECT p.id INTO v_candidate
    FROM unnest(v_step.responsible_user_ids) WITH ORDINALITY u(uid, ord)
    JOIN public.profiles p ON p.id = u.uid
    WHERE p.is_available = true
    ORDER BY u.ord
    LIMIT 1;

    IF v_candidate IS NOT NULL THEN
      RETURN v_candidate;
    END IF;
  END IF;

  -- 3. Priorité 2 : rôles autorisés (premier rôle, premier user dispo)
  IF v_step.responsible_roles IS NOT NULL
     AND array_length(v_step.responsible_roles, 1) > 0
     AND v_step.assignment_target IN ('roles', 'mixed') THEN
    FOREACH v_role IN ARRAY v_step.responsible_roles LOOP
      SELECT ur.user_id INTO v_candidate
      FROM public.user_roles ur
      JOIN public.profiles p ON p.id = ur.user_id
      WHERE ur.role::text = v_role
        AND p.is_available = true
      ORDER BY p.created_at ASC
      LIMIT 1;

      IF v_candidate IS NOT NULL THEN
        RETURN v_candidate;
      END IF;
    END LOOP;
  END IF;

  -- 4. Priorité 3 : configuration legacy workflow_step_responsibles
  SELECT wsr.default_user_id, wsr.assignment_mode, wsr.fallback_step_number
  INTO v_default_user, v_mode, v_fallback_step
  FROM public.workflow_step_responsibles wsr
  WHERE wsr.step_number = _step_number
    AND wsr.is_active = true
  LIMIT 1;

  IF v_default_user IS NOT NULL THEN
    RETURN v_default_user;
  END IF;

  IF v_mode = 'default_user_with_fallback' AND _mail_id IS NOT NULL THEN
    SELECT ma.assigned_to INTO v_fallback_user
    FROM public.mail_assignments ma
    WHERE ma.mail_id = _mail_id AND ma.step_number = v_fallback_step
    ORDER BY ma.created_at ASC
    LIMIT 1;
    RETURN v_fallback_user;
  END IF;

  RETURN NULL;
END;
$$;

-- Helper : trouver un fallback disponible pour une condition donnée
CREATE OR REPLACE FUNCTION public.resolve_fallback_user(_step_id uuid, _condition_key text)
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_ids uuid[];
  v_candidate uuid;
BEGIN
  SELECT fallback_user_ids INTO v_user_ids
  FROM public.workflow_step_fallbacks
  WHERE step_id = _step_id
    AND condition_key = _condition_key
    AND is_active = true
  LIMIT 1;

  IF v_user_ids IS NULL OR array_length(v_user_ids, 1) IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT p.id INTO v_candidate
  FROM unnest(v_user_ids) WITH ORDINALITY u(uid, ord)
  JOIN public.profiles p ON p.id = u.uid
  WHERE p.is_available = true
  ORDER BY u.ord
  LIMIT 1;

  RETURN v_candidate;
END;
$$;