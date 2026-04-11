
-- =============================================
-- 1. user_roles: prevent admin self-role-modification
-- =============================================
DROP POLICY IF EXISTS "Admins can update non-superadmin roles" ON public.user_roles;
CREATE POLICY "Admins can update non-superadmin roles"
ON public.user_roles
FOR UPDATE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND role <> 'superadmin'::app_role
  AND user_id <> auth.uid()
)
WITH CHECK (
  role <> 'superadmin'::app_role
  AND role <> 'admin'::app_role
);

-- =============================================
-- 2. mail_processing_history: verify agent is assigned to mail
-- =============================================
DROP POLICY IF EXISTS "Agents can insert history" ON public.mail_processing_history;
CREATE POLICY "Agents can insert history"
ON public.mail_processing_history
FOR INSERT
WITH CHECK (
  auth.uid() = agent_id
  AND EXISTS (
    SELECT 1 FROM public.mail_assignments ma
    WHERE ma.mail_id = mail_processing_history.mail_id
      AND ma.assigned_to = auth.uid()
  )
);

-- =============================================
-- 3. Tenant isolation RLS policies (additive, non-destructive)
-- Uses get_user_tenant_id() which returns NULL for users without tenant
-- NULL tenant = no filtering (backward compatible)
-- =============================================

-- 3a. mails: tenant filter on SELECT
CREATE POLICY "Tenant isolation mails"
ON public.mails
FOR SELECT
USING (
  tenant_id IS NULL
  OR get_user_tenant_id(auth.uid()) IS NULL
  OR tenant_id = get_user_tenant_id(auth.uid())
);

-- 3b. mail_assignments: tenant filter on SELECT
CREATE POLICY "Tenant isolation mail_assignments"
ON public.mail_assignments
FOR SELECT
USING (
  tenant_id IS NULL
  OR get_user_tenant_id(auth.uid()) IS NULL
  OR tenant_id = get_user_tenant_id(auth.uid())
);

-- 3c. notifications: tenant filter on SELECT
CREATE POLICY "Tenant isolation notifications"
ON public.notifications
FOR SELECT
USING (
  tenant_id IS NULL
  OR get_user_tenant_id(auth.uid()) IS NULL
  OR tenant_id = get_user_tenant_id(auth.uid())
);

-- 3d. workflow_transitions: tenant filter on SELECT
CREATE POLICY "Tenant isolation workflow_transitions"
ON public.workflow_transitions
FOR SELECT
USING (
  tenant_id IS NULL
  OR get_user_tenant_id(auth.uid()) IS NULL
  OR tenant_id = get_user_tenant_id(auth.uid())
);
