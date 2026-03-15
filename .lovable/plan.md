
Objectif: rétablir un workflow 100% fonctionnel en production (Vercel + base de données), sans perte de courriers ni blocage RLS.

1) Résultat de l’audit (cause racine)
- Blocage principal confirmé: `infinite recursion detected in policy for relation "mails"`.
- Cause: boucle RLS entre:
  - policy `mails` → sous-requête sur `mail_assignments`
  - policy `mail_assignments` (`Reception see own mail assignments`) → sous-requête sur `mails`
- Deuxième blocage confirmé: `new row violates row-level security policy for table "mails"` lors de l’enregistrement depuis un compte `superadmin`.
- Cause: `mails` n’autorise l’INSERT qu’à `reception` et `secretariat`, alors que l’UI permet aussi l’accès à “Enregistrement” pour `superadmin/admin`.

2) Correctifs à implémenter
A. Migration SQL (obligatoire, production)
- Supprimer la récursion RLS en remplaçant les policies de réception qui interrogent `mails` via une fonction `SECURITY DEFINER`.
- Ajouter les policies manquantes pour `superadmin` sur `mails` (SELECT/UPDATE/DELETE).
- Autoriser INSERT pour `admin/superadmin` sur `mails` avec contrainte stricte `registered_by = auth.uid()`.

SQL à exécuter (copier-coller tel quel):
```sql
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
```

B. Correctifs code front (recommandé pour fiabilité)
- `src/pages/MailEntry.tsx`
  - Rendre l’enregistrement + routage robuste:
    - vérifier toutes les erreurs (`update mails`, `insert notifications`, `insert workflow_transitions`),
    - différencier message “enregistré seulement” vs “enregistré + routé”,
    - éviter les faux positifs de succès.
  - Optionnel robuste: rollback du fichier uploadé si insertion mail échoue.
- `src/pages/InboxPage.tsx`
  - afficher explicitement l’erreur de fetch (au lieu d’un état silencieux) pour diagnostic immédiat en prod.

3) Edge functions
- Aucune edge function additionnelle n’est nécessaire pour ce bug.
- Aucun redeploy edge function requis pour ce correctif (c’est un problème RLS + handling front).

4) Validation production (E2E)
- Test 1 (superadmin): créer un courrier avec PJ → doit s’insérer sans erreur RLS.
- Test 2 (reception): créer un courrier adressé à Ministre/DirCab → routage auto + notification + transition.
- Test 3 (compte destinataire): vérifier apparition immédiate dans Inbox.
- Test 4 (reception-dashboard): le courrier créé doit rester visible dans le registre de l’émetteur.
- Test 5 (workflow): avancer 2→3→4 puis vérifier historique transitions sans erreur 500.
