-- Bootstrap calendar_events (RDV / réunions liés aux courriers)
-- Production partielle : la table n'existait pas → RDV étape 2 silencieusement ignorés.

-- Rôles utilisés dans les policies (no-op si déjà présents)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'directeur';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'dg';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'autorite_1';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'secretariat';

CREATE TABLE IF NOT EXISTS public.calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mail_id uuid REFERENCES public.mails(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  event_date date NOT NULL,
  event_time time,
  end_time time,
  location text,
  participants text[] DEFAULT '{}',
  participant_ids uuid[] DEFAULT '{}',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS participant_ids uuid[] DEFAULT '{}';

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS participants text[] DEFAULT '{}';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'tenants'
  ) THEN
    ALTER TABLE public.calendar_events
      ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) DEFAULT NULL;
    CREATE INDEX IF NOT EXISTS idx_calendar_events_tenant ON public.calendar_events(tenant_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_calendar_events_mail_id ON public.calendar_events(mail_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_event_date ON public.calendar_events(event_date);
CREATE INDEX IF NOT EXISTS idx_calendar_events_created_by ON public.calendar_events(created_by);

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read events" ON public.calendar_events;
DROP POLICY IF EXISTS "Authenticated insert events" ON public.calendar_events;
DROP POLICY IF EXISTS "Creator or admin update events" ON public.calendar_events;
DROP POLICY IF EXISTS "Creator or admin delete events" ON public.calendar_events;
DROP POLICY IF EXISTS "View events" ON public.calendar_events;
DROP POLICY IF EXISTS "Insert events" ON public.calendar_events;
DROP POLICY IF EXISTS "Authorized roles insert events" ON public.calendar_events;
DROP POLICY IF EXISTS "Update events" ON public.calendar_events;
DROP POLICY IF EXISTS "Delete events" ON public.calendar_events;
DROP POLICY IF EXISTS "Conseillers see related calendar events" ON public.calendar_events;

-- Lecture : créateur, participant, assigné au courrier lié, rôles direction / admin
CREATE POLICY "Calendar events readable by stakeholders"
ON public.calendar_events FOR SELECT TO authenticated
USING (
  created_by = auth.uid()
  OR auth.uid() = ANY (COALESCE(participant_ids, '{}'))
  OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'ministre'::public.app_role)
  OR public.has_role(auth.uid(), 'directeur'::public.app_role)
  OR public.has_role(auth.uid(), 'dg'::public.app_role)
  OR public.has_role(auth.uid(), 'autorite_1'::public.app_role)
  OR public.has_role(auth.uid(), 'dircab'::public.app_role)
  OR public.has_role(auth.uid(), 'dircaba'::public.app_role)
  OR public.has_role(auth.uid(), 'secretariat'::public.app_role)
  OR (
    mail_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.mail_assignments ma
      WHERE ma.mail_id = calendar_events.mail_id
        AND ma.assigned_to = auth.uid()
    )
  )
);

-- Insertion : acteurs workflow (DG étape 2, secrétariat, admin…)
CREATE POLICY "Calendar events insert by workflow actors"
ON public.calendar_events FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND (
    public.has_role(auth.uid(), 'superadmin'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'ministre'::public.app_role)
    OR public.has_role(auth.uid(), 'directeur'::public.app_role)
    OR public.has_role(auth.uid(), 'dg'::public.app_role)
    OR public.has_role(auth.uid(), 'autorite_1'::public.app_role)
    OR public.has_role(auth.uid(), 'dircab'::public.app_role)
    OR public.has_role(auth.uid(), 'dircaba'::public.app_role)
    OR public.has_role(auth.uid(), 'secretariat'::public.app_role)
  )
);

CREATE POLICY "Calendar events update by owner or admin"
ON public.calendar_events FOR UPDATE TO authenticated
USING (
  created_by = auth.uid()
  OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'ministre'::public.app_role)
  OR public.has_role(auth.uid(), 'directeur'::public.app_role)
  OR public.has_role(auth.uid(), 'dg'::public.app_role)
  OR public.has_role(auth.uid(), 'autorite_1'::public.app_role)
);

CREATE POLICY "Calendar events delete by owner or admin"
ON public.calendar_events FOR DELETE TO authenticated
USING (
  created_by = auth.uid()
  OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

DROP TRIGGER IF EXISTS update_calendar_events_updated_at ON public.calendar_events;
CREATE TRIGGER update_calendar_events_updated_at
  BEFORE UPDATE ON public.calendar_events
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

NOTIFY pgrst, 'reload schema';
