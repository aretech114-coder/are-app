
-- ============================================================
-- 1. Colonnes mails
-- ============================================================
ALTER TABLE public.mails
  ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'entrant'
    CHECK (direction IN ('entrant','sortant')),
  ADD COLUMN IF NOT EXISTS target_service_id uuid,
  ADD COLUMN IF NOT EXISTS province_code text,
  ADD COLUMN IF NOT EXISTS locked_for_edit boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_mails_direction ON public.mails(direction);
CREATE INDEX IF NOT EXISTS idx_mails_province ON public.mails(province_code);

-- ============================================================
-- 2. Colonnes profiles
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS province_code text,
  ADD COLUMN IF NOT EXISTS habilitation_speciale boolean NOT NULL DEFAULT false;

-- ============================================================
-- 3. Référentiels
-- ============================================================
CREATE TABLE IF NOT EXISTS public.mail_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  label text NOT NULL,
  direction text NOT NULL DEFAULT 'both' CHECK (direction IN ('entrant','sortant','both')),
  default_workflow_step integer,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.services_concernes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  label text NOT NULL,
  default_handler_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mails
  ADD CONSTRAINT mails_target_service_fk
  FOREIGN KEY (target_service_id) REFERENCES public.services_concernes(id) ON DELETE SET NULL;

ALTER TABLE public.mail_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services_concernes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read mail_types"
  ON public.mail_types FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin manage mail_types"
  ON public.mail_types FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'superadmin'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'superadmin'));

CREATE POLICY "Authenticated read services_concernes"
  ON public.services_concernes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin manage services_concernes"
  ON public.services_concernes FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'superadmin'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'superadmin'));

-- ============================================================
-- 4. Helpers
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_user_province(_uid uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT province_code FROM public.profiles WHERE id = _uid
$$;

CREATE OR REPLACE FUNCTION public.has_habilitation_speciale(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT COALESCE(habilitation_speciale,false) FROM public.profiles WHERE id = _uid
$$;

-- ============================================================
-- 5. Verrouillage automatique sur transitions
-- ============================================================
CREATE OR REPLACE FUNCTION public.lock_mail_on_workflow_transition()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.action IS NOT NULL AND NEW.action <> 'register' THEN
    UPDATE public.mails SET locked_for_edit = true WHERE id = NEW.mail_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lock_mail_on_transition ON public.workflow_transitions;
CREATE TRIGGER trg_lock_mail_on_transition
  AFTER INSERT ON public.workflow_transitions
  FOR EACH ROW EXECUTE FUNCTION public.lock_mail_on_workflow_transition();

-- Pré-verrouiller les courriers déjà engagés (current_step > 1)
UPDATE public.mails SET locked_for_edit = true WHERE current_step > 1;

-- ============================================================
-- 6. Trigger : empêche modification du registre si verrouillé
-- ============================================================
CREATE OR REPLACE FUNCTION public.prevent_locked_registry_updates()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF COALESCE(OLD.locked_for_edit,false) = true
     AND NOT has_role(auth.uid(),'superadmin')
     AND NOT has_role(auth.uid(),'admin')
     AND (
       NEW.sender_name IS DISTINCT FROM OLD.sender_name
       OR NEW.sender_organization IS DISTINCT FROM OLD.sender_organization
       OR NEW.sender_email IS DISTINCT FROM OLD.sender_email
       OR NEW.sender_phone IS DISTINCT FROM OLD.sender_phone
       OR NEW.sender_address IS DISTINCT FROM OLD.sender_address
       OR NEW.sender_city IS DISTINCT FROM OLD.sender_city
       OR NEW.subject IS DISTINCT FROM OLD.subject
       OR NEW.description IS DISTINCT FROM OLD.description
       OR NEW.mail_type IS DISTINCT FROM OLD.mail_type
       OR NEW.priority IS DISTINCT FROM OLD.priority
       OR NEW.addressed_to IS DISTINCT FROM OLD.addressed_to
       OR NEW.reception_date IS DISTINCT FROM OLD.reception_date
       OR NEW.direction IS DISTINCT FROM OLD.direction
       OR NEW.target_service_id IS DISTINCT FROM OLD.target_service_id
     )
  THEN
    RAISE EXCEPTION 'Courrier verrouillé : enregistrement déjà pris en charge dans le workflow.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_locked_registry_updates ON public.mails;
CREATE TRIGGER trg_prevent_locked_registry_updates
  BEFORE UPDATE ON public.mails
  FOR EACH ROW EXECUTE FUNCTION public.prevent_locked_registry_updates();

-- ============================================================
-- 7. Isolation province (policy RESTRICTIVE — s'intersecte avec les permissives)
-- ============================================================
DROP POLICY IF EXISTS "Province isolation registre" ON public.mails;
CREATE POLICY "Province isolation registre"
  ON public.mails AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'superadmin')
    OR has_role(auth.uid(),'admin')
    OR has_habilitation_speciale(auth.uid())
    OR province_code IS NULL
    OR public.get_user_province(auth.uid()) IS NULL
    OR province_code = public.get_user_province(auth.uid())
  );

-- Réception : voir tous les courriers de sa province (pas seulement les siens)
DROP POLICY IF EXISTS "Reception sees province mail" ON public.mails;
CREATE POLICY "Reception sees province mail"
  ON public.mails FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'reception'));

-- ============================================================
-- 8. Realtime
-- ============================================================
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.mails;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.workflow_transitions;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.mails REPLICA IDENTITY FULL;
ALTER TABLE public.workflow_transitions REPLICA IDENTITY FULL;

-- ============================================================
-- 9. Seed des référentiels
-- ============================================================
INSERT INTO public.mail_types (code, label, direction) VALUES
  ('ordinaire','Ordinaire','both'),
  ('audience','Demande d''audience','entrant'),
  ('presidence','Présidence','both'),
  ('institutionnel','Institutionnel','both'),
  ('interministeriel','Inter-ministériel','both'),
  ('note_technique','Note technique','both'),
  ('correspondance','Correspondance','sortant'),
  ('decision','Décision','sortant')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.services_concernes (code, label) VALUES
  ('cabinet','Cabinet du Ministre'),
  ('dircab','Direction du Cabinet'),
  ('secretariat','Secrétariat général'),
  ('juridique','Service juridique'),
  ('finances','Direction des finances'),
  ('technique','Direction technique'),
  ('rh','Ressources humaines')
ON CONFLICT (code) DO NOTHING;

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_mail_types_updated_at ON public.mail_types;
CREATE TRIGGER trg_mail_types_updated_at BEFORE UPDATE ON public.mail_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_services_concernes_updated_at ON public.services_concernes;
CREATE TRIGGER trg_services_concernes_updated_at BEFORE UPDATE ON public.services_concernes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
