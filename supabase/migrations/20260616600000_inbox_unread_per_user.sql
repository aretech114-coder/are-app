-- Migration AG — Inbox « Nouveaux » par utilisateur et par étape (mail_inbox_reads)

CREATE TABLE IF NOT EXISTS public.mail_inbox_reads (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mail_id uuid NOT NULL REFERENCES public.mails(id) ON DELETE CASCADE,
  step_number integer NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, mail_id, step_number)
);

CREATE INDEX IF NOT EXISTS mail_inbox_reads_user_mail_idx
  ON public.mail_inbox_reads (user_id, mail_id);

ALTER TABLE public.mail_inbox_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mail_inbox_reads_select_own" ON public.mail_inbox_reads;
CREATE POLICY "mail_inbox_reads_select_own"
  ON public.mail_inbox_reads FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "mail_inbox_reads_insert_own" ON public.mail_inbox_reads;
CREATE POLICY "mail_inbox_reads_insert_own"
  ON public.mail_inbox_reads FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "mail_inbox_reads_update_own" ON public.mail_inbox_reads;
CREATE POLICY "mail_inbox_reads_update_own"
  ON public.mail_inbox_reads FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE ON public.mail_inbox_reads TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_my_mail_opened(_mail_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_step integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT public.can_access_mail_inbox(_mail_id, 'read') THEN
    RAISE EXCEPTION 'access denied';
  END IF;

  SELECT m.current_step INTO v_step
  FROM public.mails m
  WHERE m.id = _mail_id;

  IF v_step IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.mail_inbox_reads (user_id, mail_id, step_number, opened_at)
  VALUES (auth.uid(), _mail_id, v_step, now())
  ON CONFLICT (user_id, mail_id, step_number)
  DO UPDATE SET opened_at = EXCLUDED.opened_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_my_mail_opened(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.list_my_mails(text[]);

CREATE OR REPLACE FUNCTION public.list_my_mails(
  _statuses text[] DEFAULT ARRAY['pending', 'in_progress']::text[]
)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT
    to_jsonb(m.*) || jsonb_build_object(
      'is_unread_for_me',
      NOT EXISTS (
        SELECT 1
        FROM public.mail_inbox_reads r
        WHERE r.user_id = auth.uid()
          AND r.mail_id = m.id
          AND r.step_number = m.current_step
      )
    )
  FROM public.mails m
  WHERE (_statuses IS NULL OR m.status::text = ANY(_statuses))
    AND public.can_access_mail_inbox(m.id, 'read')
  ORDER BY m.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.list_my_mails(text[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
