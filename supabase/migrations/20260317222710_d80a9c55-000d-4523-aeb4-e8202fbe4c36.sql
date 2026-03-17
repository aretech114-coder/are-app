CREATE OR REPLACE FUNCTION public.can_transition_update_mail(_mail_id uuid, _step integer, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workflow_transitions wt
    WHERE wt.mail_id = _mail_id
      AND wt.performed_by = _user_id
      AND wt.created_at > now() - interval '15 minutes'
  );
$$;