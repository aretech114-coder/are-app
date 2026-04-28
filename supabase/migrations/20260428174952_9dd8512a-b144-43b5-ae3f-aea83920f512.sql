-- ============================================================
-- Sous-livraison (a) : Ajout des rôles DG/DGA/DAF/DT
-- ============================================================
-- IMPORTANT : Cette migration ajoute des valeurs à l'enum app_role
-- puis étend les RLS. Postgres autorise l'utilisation immédiate
-- des nouvelles valeurs dans la même transaction depuis PG12+.
-- ============================================================

-- 1. Ajout des nouvelles valeurs à l'enum (idempotent via IF NOT EXISTS)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
                 WHERE t.typname = 'app_role' AND e.enumlabel = 'dg') THEN
    ALTER TYPE public.app_role ADD VALUE 'dg';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
                 WHERE t.typname = 'app_role' AND e.enumlabel = 'dga') THEN
    ALTER TYPE public.app_role ADD VALUE 'dga';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
                 WHERE t.typname = 'app_role' AND e.enumlabel = 'daf') THEN
    ALTER TYPE public.app_role ADD VALUE 'daf';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
                 WHERE t.typname = 'app_role' AND e.enumlabel = 'dt') THEN
    ALTER TYPE public.app_role ADD VALUE 'dt';
  END IF;
END $$;

COMMIT;

-- ============================================================
-- 2. Extension des RLS pour les nouveaux rôles directionnels
-- (Nouvelle transaction obligatoire pour utiliser les enum values)
-- ============================================================
BEGIN;

-- ---------- mails : SELECT pour DG/DGA/DAF/DT ----------
DROP POLICY IF EXISTS "Direction sees all mail" ON public.mails;
CREATE POLICY "Direction sees all mail"
  ON public.mails FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'dg'::app_role)
    OR has_role(auth.uid(), 'dga'::app_role)
    OR has_role(auth.uid(), 'daf'::app_role)
    OR has_role(auth.uid(), 'dt'::app_role)
  );

-- ---------- mails : UPDATE pour DG/DGA/DAF/DT ----------
DROP POLICY IF EXISTS "Direction can update mail" ON public.mails;
CREATE POLICY "Direction can update mail"
  ON public.mails FOR UPDATE
  TO authenticated
  USING (
    has_role(auth.uid(), 'dg'::app_role)
    OR has_role(auth.uid(), 'dga'::app_role)
    OR has_role(auth.uid(), 'daf'::app_role)
    OR has_role(auth.uid(), 'dt'::app_role)
  );

-- ---------- mail_assignments : SELECT pour DG/DGA/DAF/DT ----------
DROP POLICY IF EXISTS "Direction sees all assignments" ON public.mail_assignments;
CREATE POLICY "Direction sees all assignments"
  ON public.mail_assignments FOR SELECT
  USING (
    has_role(auth.uid(), 'dg'::app_role)
    OR has_role(auth.uid(), 'dga'::app_role)
    OR has_role(auth.uid(), 'daf'::app_role)
    OR has_role(auth.uid(), 'dt'::app_role)
  );

-- ---------- mail_assignments : INSERT pour DG/DGA/DAF/DT ----------
DROP POLICY IF EXISTS "Direction can insert assignments" ON public.mail_assignments;
CREATE POLICY "Direction can insert assignments"
  ON public.mail_assignments FOR INSERT
  TO authenticated
  WITH CHECK (
    assigned_by = auth.uid()
    AND (
      has_role(auth.uid(), 'dg'::app_role)
      OR has_role(auth.uid(), 'dga'::app_role)
      OR has_role(auth.uid(), 'daf'::app_role)
      OR has_role(auth.uid(), 'dt'::app_role)
    )
  );

-- ---------- profiles : SELECT pour les nouveaux rôles ----------
DROP POLICY IF EXISTS "Direction can view profiles" ON public.profiles;
CREATE POLICY "Direction can view profiles"
  ON public.profiles FOR SELECT
  USING (
    has_role(auth.uid(), 'dg'::app_role)
    OR has_role(auth.uid(), 'dga'::app_role)
    OR has_role(auth.uid(), 'daf'::app_role)
    OR has_role(auth.uid(), 'dt'::app_role)
  );

-- ---------- notifications : INSERT pour DG/DGA/DAF/DT ----------
DROP POLICY IF EXISTS "Direction can insert notifications" ON public.notifications;
CREATE POLICY "Direction can insert notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'dg'::app_role)
    OR has_role(auth.uid(), 'dga'::app_role)
    OR has_role(auth.uid(), 'daf'::app_role)
    OR has_role(auth.uid(), 'dt'::app_role)
  );

-- ---------- workflow_transitions : INSERT pour DG/DGA/DAF/DT ----------
DROP POLICY IF EXISTS "Direction insert transitions" ON public.workflow_transitions;
CREATE POLICY "Direction insert transitions"
  ON public.workflow_transitions FOR INSERT
  WITH CHECK (
    performed_by = auth.uid()
    AND (
      has_role(auth.uid(), 'dg'::app_role)
      OR has_role(auth.uid(), 'dga'::app_role)
      OR has_role(auth.uid(), 'daf'::app_role)
      OR has_role(auth.uid(), 'dt'::app_role)
    )
  );

-- ---------- workflow_transitions : SELECT pour DG/DGA/DAF/DT ----------
DROP POLICY IF EXISTS "Direction read all transitions" ON public.workflow_transitions;
CREATE POLICY "Direction read all transitions"
  ON public.workflow_transitions FOR SELECT
  USING (
    has_role(auth.uid(), 'dg'::app_role)
    OR has_role(auth.uid(), 'dga'::app_role)
    OR has_role(auth.uid(), 'daf'::app_role)
    OR has_role(auth.uid(), 'dt'::app_role)
  );

-- ---------- site_settings : SELECT pour DG/DGA/DAF/DT ----------
DROP POLICY IF EXISTS "Direction read site_settings" ON public.site_settings;
CREATE POLICY "Direction read site_settings"
  ON public.site_settings FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'dg'::app_role)
    OR has_role(auth.uid(), 'dga'::app_role)
    OR has_role(auth.uid(), 'daf'::app_role)
    OR has_role(auth.uid(), 'dt'::app_role)
  );

-- ---------- user_roles : SELECT pour DG/DGA/DAF/DT (pour assigner) ----------
DROP POLICY IF EXISTS "Direction read all roles" ON public.user_roles;
CREATE POLICY "Direction read all roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'dg'::app_role)
    OR has_role(auth.uid(), 'dga'::app_role)
    OR has_role(auth.uid(), 'daf'::app_role)
    OR has_role(auth.uid(), 'dt'::app_role)
  );

-- ---------- workflow_step_responsibles : SELECT pour DG/DGA/DAF/DT ----------
DROP POLICY IF EXISTS "Direction read step responsibles" ON public.workflow_step_responsibles;
CREATE POLICY "Direction read step responsibles"
  ON public.workflow_step_responsibles FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'dg'::app_role)
    OR has_role(auth.uid(), 'dga'::app_role)
    OR has_role(auth.uid(), 'daf'::app_role)
    OR has_role(auth.uid(), 'dt'::app_role)
  );

COMMIT;