-- Réparation idempotente : policies mail_access_gravity (Production partielle)
-- Corrige: policy "mails_select_by_access" for table "mails" already exists
-- À exécuter si 20260602120000 a échoué à mi-parcours, puis relancer sections 8-9 de gravity si besoin.

-- ---------------------------------------------------------------------------
-- Policies mails (section 4 gravity)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "mails_select_by_access" ON public.mails;
CREATE POLICY "mails_select_by_access"
  ON public.mails FOR SELECT TO authenticated
  USING (public.can_access_mail(id, 'read'));

DROP POLICY IF EXISTS "mails_update_by_access" ON public.mails;
CREATE POLICY "mails_update_by_access"
  ON public.mails FOR UPDATE TO authenticated
  USING (public.can_access_mail(id, 'write'))
  WITH CHECK (public.can_access_mail(id, 'write'));

DROP POLICY IF EXISTS "Admins can delete mail" ON public.mails;
CREATE POLICY "Admins can delete mail"
  ON public.mails FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'superadmin'::public.app_role));

-- ---------------------------------------------------------------------------
-- mail_assignments (section 5)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "mail_assignments_select_by_mail_access" ON public.mail_assignments;
CREATE POLICY "mail_assignments_select_by_mail_access"
  ON public.mail_assignments FOR SELECT TO authenticated
  USING (public.can_access_mail(mail_id, 'read'));

DROP POLICY IF EXISTS "mail_assignments_insert_authorized" ON public.mail_assignments;
CREATE POLICY "mail_assignments_insert_authorized"
  ON public.mail_assignments FOR INSERT TO authenticated
  WITH CHECK (
    assigned_by = auth.uid()
    AND public.can_access_mail(mail_id, 'write')
  );

DROP POLICY IF EXISTS "mail_assignments_update_own_or_admin" ON public.mail_assignments;
CREATE POLICY "mail_assignments_update_own_or_admin"
  ON public.mail_assignments FOR UPDATE TO authenticated
  USING (
    assigned_to = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
  );

-- ---------------------------------------------------------------------------
-- workflow_transitions (section 6)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "workflow_transitions_select_by_mail_access" ON public.workflow_transitions;
CREATE POLICY "workflow_transitions_select_by_mail_access"
  ON public.workflow_transitions FOR SELECT TO authenticated
  USING (public.can_access_mail(mail_id, 'read'));

DROP POLICY IF EXISTS "workflow_transitions_insert_by_mail_write" ON public.workflow_transitions;
CREATE POLICY "workflow_transitions_insert_by_mail_write"
  ON public.workflow_transitions FOR INSERT TO authenticated
  WITH CHECK (
    performed_by = auth.uid()
    AND public.can_access_mail(mail_id, 'write')
  );

-- ---------------------------------------------------------------------------
-- mail_contributions (section 7) — table requise
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mail_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mail_id uuid NOT NULL REFERENCES public.mails(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  step_number integer NOT NULL DEFAULT 4,
  body text,
  attachment_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mail_contributions_status_check CHECK (status IN ('draft', 'submitted')),
  CONSTRAINT mail_contributions_mail_user_step_key UNIQUE (mail_id, user_id, step_number)
);

ALTER TABLE public.mail_contributions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mail_contributions_select" ON public.mail_contributions;
CREATE POLICY "mail_contributions_select"
  ON public.mail_contributions FOR SELECT TO authenticated
  USING (public.can_access_mail(mail_id, 'read'));

DROP POLICY IF EXISTS "mail_contributions_insert" ON public.mail_contributions;
CREATE POLICY "mail_contributions_insert"
  ON public.mail_contributions FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.can_access_mail(mail_id, 'write')
    AND EXISTS (
      SELECT 1 FROM public.mails m
      WHERE m.id = mail_id AND m.current_step = step_number
    )
  );

DROP POLICY IF EXISTS "mail_contributions_update" ON public.mail_contributions;
CREATE POLICY "mail_contributions_update"
  ON public.mail_contributions FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

NOTIFY pgrst, 'reload schema';
