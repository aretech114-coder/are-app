
-- 1. Fix tenant isolation on mails
DROP POLICY IF EXISTS "Tenant isolation mails" ON public.mails;
CREATE POLICY "Tenant isolation mails" ON public.mails
  FOR SELECT USING (
    (tenant_id IS NULL) OR (tenant_id = get_user_tenant_id(auth.uid()))
  );

-- 2. Fix tenant isolation on mail_assignments
DROP POLICY IF EXISTS "Tenant isolation mail_assignments" ON public.mail_assignments;
CREATE POLICY "Tenant isolation mail_assignments" ON public.mail_assignments
  FOR SELECT USING (
    (tenant_id IS NULL) OR (tenant_id = get_user_tenant_id(auth.uid()))
  );

-- 3. Fix tenant isolation on workflow_transitions
DROP POLICY IF EXISTS "Tenant isolation workflow_transitions" ON public.workflow_transitions;
CREATE POLICY "Tenant isolation workflow_transitions" ON public.workflow_transitions
  FOR SELECT USING (
    (tenant_id IS NULL) OR (tenant_id = get_user_tenant_id(auth.uid()))
  );

-- 4. Remove redundant tenant isolation on notifications
DROP POLICY IF EXISTS "Tenant isolation notifications" ON public.notifications;

-- 5. Fix admin delete escalation on user_roles
DROP POLICY IF EXISTS "Admins can delete non-superadmin roles" ON public.user_roles;
CREATE POLICY "Admins can delete non-superadmin roles" ON public.user_roles
  FOR DELETE USING (
    has_role(auth.uid(), 'admin'::app_role)
    AND role <> 'superadmin'::app_role
    AND role <> 'admin'::app_role
  );
