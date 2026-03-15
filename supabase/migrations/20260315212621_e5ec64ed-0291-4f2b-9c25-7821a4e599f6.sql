
-- 1) Helper anti-récursion (bypass RLS via SECURITY DEFINER)
create or replace function public.is_mail_registered_by(_mail_id uuid, _user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.mails m
    where m.id = _mail_id
      and m.registered_by = _user_id
  );
$$;

-- 2) Corriger la policy récursive mail_assignments
drop policy if exists "Reception see own mail assignments" on public.mail_assignments;
create policy "Reception see own mail assignments"
on public.mail_assignments
for select
to authenticated
using (
  public.has_role(auth.uid(), 'reception'::public.app_role)
  and public.is_mail_registered_by(mail_assignments.mail_id, auth.uid())
);

-- 3) Corriger la policy récursive workflow_transitions
drop policy if exists "Reception read own mail transitions" on public.workflow_transitions;
create policy "Reception read own mail transitions"
on public.workflow_transitions
for select
to authenticated
using (
  public.has_role(auth.uid(), 'reception'::public.app_role)
  and public.is_mail_registered_by(workflow_transitions.mail_id, auth.uid())
);

-- 4) Aligner droits superadmin/admin avec l'UI sur mails
drop policy if exists "SuperAdmin sees all mail" on public.mails;
create policy "SuperAdmin sees all mail"
on public.mails
for select
to authenticated
using (public.has_role(auth.uid(), 'superadmin'::public.app_role));

drop policy if exists "SuperAdmin can update any mail" on public.mails;
create policy "SuperAdmin can update any mail"
on public.mails
for update
to authenticated
using (public.has_role(auth.uid(), 'superadmin'::public.app_role));

drop policy if exists "SuperAdmin can delete any mail" on public.mails;
create policy "SuperAdmin can delete any mail"
on public.mails
for delete
to authenticated
using (public.has_role(auth.uid(), 'superadmin'::public.app_role));

drop policy if exists "Admin and SuperAdmin can insert mail" on public.mails;
create policy "Admin and SuperAdmin can insert mail"
on public.mails
for insert
to authenticated
with check (
  registered_by = auth.uid()
  and (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    or public.has_role(auth.uid(), 'superadmin'::public.app_role)
  )
);
