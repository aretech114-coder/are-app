-- Visibilité des noms des collaborateurs sur un courrier accessible.
-- Problème : les agents / viewers ne voyaient que leur propre profil (RLS) → « Inconnu »
-- pour les co-assignés traitement et copie lecture seule.
-- Règle : si can_access_mail(mail_id, 'read'), lire full_name des assignés, assigneurs,
-- acteurs workflow et enregistreur de ce courrier.

DROP POLICY IF EXISTS "profiles_select_mail_collaborators" ON public.profiles;
CREATE POLICY "profiles_select_mail_collaborators"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.mail_assignments ma
      WHERE ma.assigned_to = profiles.id
        AND public.can_access_mail(ma.mail_id, 'read')
    )
    OR EXISTS (
      SELECT 1
      FROM public.mail_assignments ma
      WHERE ma.assigned_by = profiles.id
        AND public.can_access_mail(ma.mail_id, 'read')
    )
    OR EXISTS (
      SELECT 1
      FROM public.workflow_transitions wt
      WHERE wt.performed_by = profiles.id
        AND public.can_access_mail(wt.mail_id, 'read')
    )
    OR EXISTS (
      SELECT 1
      FROM public.mails m
      WHERE m.registered_by = profiles.id
        AND public.can_access_mail(m.id, 'read')
    )
  );

NOTIFY pgrst, 'reload schema';
