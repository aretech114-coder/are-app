# Production — ordre d'application manuelle

Base Production **partielle** : appliquer les migrations bootstrap une par une dans le SQL Editor.

## Déjà fait (juin 2026)

| Fichier | Objet |
|---------|--------|
| `20260602140000_storage_buckets_incoming.sql` | Buckets Storage |
| `20260602150000_mails_form_columns_bootstrap.sql` | Colonnes formulaire |
| `20260602160000_mails_core_attachment_bootstrap.sql` | `attachment_url`, core |
| `20260602170000_mails_insert_policies_bootstrap.sql` | 3 policies INSERT |
| `20260602180000_workflow_tables_bootstrap.sql` | workflow + 9 étapes SLA |

## En cours / à compléter

| Étape | Fichier | Note |
|-------|---------|------|
| A | `20260602190000_gravity_policies_idempotent.sql` | **Si erreur policy already exists** sur gravity |
| B | `20260602120000_mail_access_gravity.sql` | Relancer **entièrement** (maintenant idempotent sur policies) ou seulement §8-9 si A+§1-3 OK |
| C | `20260603120000_workflow_rls_unblock.sql` | §0 enum **d'abord**, commit, puis reste |
| D | `20260528120000_dg_step2_attachments_rls.sql` | PJ étape 2 |
| E | `20260601120000_dg_storage_directeur_rls.sql` | Storage DG |
| F | `20260602200000_workflow_action_labels_bootstrap.sql` | action_labels + responsible_roles |
| G | `20260602210000_can_access_dg_interim_steps.sql` | DG étapes 2-6 + intérim + notif step 4 |
| H | `20260603130000_workflow_inactive_step_bypass.sql` | Bypass étape 1 inactive + libellés ARE + réparation courriers bloqués |
| I | `20260603140000_dg_assignment_rls_expand.sql` | DG/directeur/autorité : lire tous profils + rôles (liste assignation étape 2) |
| J | `20260603150000_workflow_are_unified.sql` | Étapes 1/3/5/7 off ; réparation courriers ; `can_access_mail` ; garde-fous assignation ; `list_assignable_users` |
| K | `20260603160000_workflow_viewers_preserve.sql` | **Copie lecture seule** : ne plus supprimer les `viewer` à l'étape 4 ; notifications dédiées |
| L | `20260604100000_mail_registry_fields.sql` | `registry_reference` + `system_reference` (registre / ID QR) |
| M | `20260606170000_fix_viewer_notification_ambiguous.sql` | **Hotfix** : `v_aid` ambiguous à l'étape 2 avec lecteurs seuls |
| N | `20260606210000_profiles_mail_collaborators_visible.sql` | Noms visibles des co-assignés / copie lecture seule sur courriers accessibles |
| O | `20260606220000_storage_collaborators_mail_scoped.sql` | Co-assignés : lecture PJ traitements (`mail-documents`) via `can_access_mail` sur le mail du chemin |
| P | `20260606230000_fix_step4_assignment_duplicates.sql` | **Doublons étape 4** : dédoublonnage + index unique + fix `advance_workflow_step` |
| Q | `20260606240000_storage_validations_deposits_paths.sql` | Storage : chemins `validations/` (DG étape 6) et `deposits/` (secrétariat étape 8) |
| R | `20260606250000_workflow_notification_body_templates.sql` | Templates corps e-mail par étape (`notification_body_template`, viewer) |
| S | `20260606260000_calendar_events_bootstrap.sql` | **Table RDV/réunions** + RLS DG/directeur (manquait en prod) |
| T | `20260608100000_lock_registry_after_dg_step.sql` | Verrou registre seulement après sortie étape 2 (DG) |
| U1 | `20260609100000_audit_events.sql` | Table `audit_events` + RPC `log_audit_event` + purge 12 mois |
| U2 | `20260609110000_audit_triggers.sql` | Triggers audit (mails, workflow, assignations) |
| U3 | `20260609120000_audit_backfill.sql` | Backfill historique workflow + registre + assignations |
| V | `20260610100000_max_upload_size_setting.sql` | Limite upload 25 Mo (configurable super admin) + sync buckets Storage |

Après **J** : exécuter [`workflow_are_config.sql`](workflow_are_config.sql) (UUID responsables) puis [`e2e_test_scenario.md`](e2e_test_scenario.md).

Après **O** (ou avec déploiement front associé) : à l'étape 4, contributors + viewers voient les traitements soumis des autres dans le dossier.

Après **P** : exécuter la requête §4 de [`repair_mail_assignment_duplicates.sql`](repair_mail_assignment_duplicates.sql) pour vérifier qu'il reste 3 viewers + 5 contributors sur le courrier test.

Après **S** : tester un RDV à l'étape 2 (DG) → page **Réunions** + dossier courrier. Vérifier : `SELECT count(*) FROM public.calendar_events;`

Après **K** (ou **M** si K déjà appliquée sans correctif) : pour les courriers déjà passés en étape 4+ sans lignes `viewer`, réassigner manuellement ou utiliser [`repair_mail_viewers.sql`](repair_mail_viewers.sql).

Après **L** : `NOTIFY pgrst, 'reload schema';` — formulaire Registre avec N° courrier, référence registre, heure dépôt auto.

## Assistant IA (OpenAI)

```bash
supabase secrets set OPENAI_API_KEY=sk-...
# optionnel : supabase secrets set OPENAI_MODEL=gpt-4o-mini
supabase functions deploy ai-assistant
```

## Audit

Exécuter `supabase/scripts/production_audit.sql` — requêtes séparées, une par une ou en bloc.

## Erreurs fréquentes

| Erreur | Action |
|--------|--------|
| `policy "X" already exists` | Exécuter `20260602190000` ou ajouter `DROP POLICY IF EXISTS` avant CREATE |
| `column/table not in schema cache` | Migration bootstrap manquante + `NOTIFY pgrst, 'reload schema'` |
| `42702 ambiguous column` | Migration **M** (`v_aid` → `viewer_uid`) ou script audit corrigé (alias `expected.bucket_id`) |
