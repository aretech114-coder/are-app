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

## Audit

Exécuter `supabase/scripts/production_audit.sql` — requêtes séparées, une par une ou en bloc.

## Erreurs fréquentes

| Erreur | Action |
|--------|--------|
| `policy "X" already exists` | Exécuter `20260602190000` ou ajouter `DROP POLICY IF EXISTS` avant CREATE |
| `column/table not in schema cache` | Migration bootstrap manquante + `NOTIFY pgrst, 'reload schema'` |
| `42702 ambiguous column` | Utiliser le script audit corrigé (alias `expected.bucket_id`) |
