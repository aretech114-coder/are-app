
-- Add mail_type_other for "Autre" mail type specification
ALTER TABLE public.mails ADD COLUMN IF NOT EXISTS mail_type_other text;

-- Add sender_organization if not present (it exists per types.ts but let's ensure)
-- Already exists per schema

-- Create missions table
CREATE TABLE public.missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  destination text,
  start_date date NOT NULL,
  end_date date,
  status text NOT NULL DEFAULT 'preparation' CHECK (status IN ('preparation', 'ongoing', 'closed')),
  assigned_to uuid NOT NULL,
  created_by uuid NOT NULL,
  budget_estimate numeric,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.missions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins see all missions" ON public.missions
  FOR SELECT USING (
    has_role(auth.uid(), 'superadmin'::app_role) OR 
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'dircab'::app_role) OR
    has_role(auth.uid(), 'ministre'::app_role)
  );

CREATE POLICY "Users see own missions" ON public.missions
  FOR SELECT USING (assigned_to = auth.uid() OR created_by = auth.uid());

CREATE POLICY "Authorized insert missions" ON public.missions
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Admins update missions" ON public.missions
  FOR UPDATE USING (
    has_role(auth.uid(), 'superadmin'::app_role) OR 
    has_role(auth.uid(), 'admin'::app_role) OR
    created_by = auth.uid()
  );

CREATE POLICY "Admins delete missions" ON public.missions
  FOR DELETE USING (
    has_role(auth.uid(), 'superadmin'::app_role) OR 
    has_role(auth.uid(), 'admin'::app_role)
  );

CREATE TRIGGER update_missions_updated_at
  BEFORE UPDATE ON public.missions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();
