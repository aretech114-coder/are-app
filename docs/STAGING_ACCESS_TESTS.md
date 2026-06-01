# Tests manuels — visibilité courriers (Staging)

## Ordre d'application SQL (Staging)

1. `20260601120000_dg_storage_directeur_rls.sql` (Storage directeur)
2. `20260602120000_mail_access_gravity.sql` (can_access_mail, mail_contributions)
3. `20260603120000_workflow_rls_unblock.sql` (RPC atomiques, lecture historique, cleanup policies)

Puis vérifier :

```sql
NOTIFY pgrst, 'reload schema';

SELECT proname, prosecdef, pg_get_function_identity_arguments(oid)
FROM pg_proc
WHERE proname IN (
  'can_access_mail', 'list_my_mails', 'advance_workflow_step',
  'submit_step4_treatment', 'submit_step7_acknowledgement'
);

SELECT polname, polcmd
FROM pg_policy p
JOIN pg_class c ON c.oid = p.polrelid
WHERE c.relname = 'mails'
ORDER BY polname;
```

Attendu sur `mails` : `mails_select_by_access`, `mails_update_by_access`, `Province isolation registre` (RESTRICTIVE), policies insert/delete réception/admin.

## Matrice personas

| Persona | Ne doit pas voir | Doit voir / faire |
|---------|------------------|-------------------|
| Agent non assigné | Courrier aléatoire | Rien dans Inbox |
| Assigné proposed (étape 4, mail à l'étape 2–3) | Actions de traitement | Rien ou aperçu si `viewer` |
| Assigné contributor (étape 4) | Courriers non assignés | Traitement + contributions des autres (soumis) |
| Assigné après passage étape 5+ | — | Courrier en lecture seule (historique) |
| DG `directeur` | Courriers jamais routés | Étapes 2, 4 (lecture contributions + brouillons), 6 ; `dg_advance` |
| DirCab | Courrier bloqué en étape 2 seule | Étapes 3 et 5 |
| Admin / superadmin | — | Tous les courriers |

## Matrice transitions (T1–T8)

| # | Persona | Action | Résultat attendu |
|---|---------|--------|------------------|
| T1 | DG | Étape 2 : assigner 2 users + PJ → Confirmer | Étape 3, pas d'erreur RLS |
| T2 | DirCab | Étape 3 → 4 | Assignations step 4 en `pending` |
| T3 | Assigné A | Étape 4 : texte + PJ → Soumettre | Contribution visible par B et DG (timestamp `processed_at`) |
| T4 | Assigné B | Soumettre après A | Message attente ou auto-advance step 5 |
| T5 | DG | `dg_advance` sans attendre B | Passage step 5/6 selon `mail_type` |
| T6 | Assignés A,B | Après step 5 | Courrier toujours visible en Suivi/Historique (lecture seule) |
| T7 | DirCab | Steps 5→6→7→8→9 | Transitions normales jusqu'à archive |
| T8 | Non assigné | Inbox | Courrier absent |

## Vérifications fonctionnelles

1. Enregistrer un courrier (réception) → visible réception uniquement à l'étape 1.
2. DG étape 2 : pré-assigner 2 agents + 1 lecteur en copie → Confirmer (sans `new row violates row-level security`).
3. Agents non assignés : Inbox vide pour ce courrier.
4. À l'étape 4 : panneau contributions visible dès l'ouverture du courrier ; mises à jour temps réel quand un autre assigné soumet.
5. DG : bouton « Valider (DG) — passer à l'étape suivante » (`dg_advance`).
6. Storage : upload PJ étape 2 (directeur) et étape 4 (conseiller assigné).
7. Inbox : si `list_my_mails` indisponible, fallback requête directe `mails` (pas d'écran vide).

## RPC de test

```sql
SELECT public.can_access_mail('MAIL_UUID'::uuid, 'read');
SELECT public.can_access_mail('MAIL_UUID'::uuid, 'write');
SELECT * FROM public.list_my_mails(ARRAY['pending','in_progress']);

-- Après soumission étape 4 (côté app ou SQL avec auth.uid() du conseiller)
SELECT * FROM public.mail_contributions WHERE mail_id = 'MAIL_UUID';
```

## Alignement app ↔ base

Vérifier que `VITE_SUPABASE_URL` de l'app déployée correspond au projet où les migrations SQL ont été exécutées.
