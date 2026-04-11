
-- Add tenant_id to tables that don't have it yet
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) DEFAULT NULL;
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) DEFAULT NULL;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) DEFAULT NULL;
ALTER TABLE public.mail_assignments ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) DEFAULT NULL;
ALTER TABLE public.workflow_transitions ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) DEFAULT NULL;
ALTER TABLE public.missions ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) DEFAULT NULL;
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) DEFAULT NULL;

-- Create indexes for tenant_id columns
CREATE INDEX IF NOT EXISTS idx_profiles_tenant ON public.profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_tenant ON public.user_roles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant ON public.notifications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_mail_assignments_tenant ON public.mail_assignments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_workflow_transitions_tenant ON public.workflow_transitions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_missions_tenant ON public.missions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_tenant ON public.calendar_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_mails_tenant ON public.mails(tenant_id);

-- Security definer function to get user's tenant_id
CREATE OR REPLACE FUNCTION public.get_user_tenant_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.profiles WHERE id = _user_id LIMIT 1;
$$;

-- Allow admin to read tenants
CREATE POLICY "Admin read tenants"
ON public.tenants
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
