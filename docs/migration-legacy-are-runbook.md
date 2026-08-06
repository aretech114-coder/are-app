# Runbook ARE — migration progressive vers ERP

Guide court pour l’équipe ARE. Brief détaillé :
[`migration-legacy-courriers-vers-erp-saas.md`](migration-legacy-courriers-vers-erp-saas.md).

Message prêt pour l’IA ERP après déploiement des vues open :
[`message-reponse-erp-import-natif.md`](message-reponse-erp-import-natif.md).

## Critères

**Éligible (legacy lecture / archived)** :

```text
status = 'archived' AND workflow_completed_at IS NOT NULL
```

**Ouvert (import natif positionné)** :

```text
NOT (status = 'archived' AND workflow_completed_at IS NOT NULL)
```

- **Nouveaux** courriers → ERP natif (annonce métier).
- **Ouverts** → import natif ERP (`legacy-are-import-native`) positionnés à `current_step`.
- **Éligibles archivés** → sync legacy (`only_eligible`) en filet / historique.

## Ordre d’exécution (Production)

Project ref prod (doc) : `axgpnkxsiudiixalbuz`  
SQL Editor : `https://supabase.com/dashboard/project/axgpnkxsiudiixalbuz/sql`

### 1. Rôle pont lecture seule

1. Ouvrir [`supabase/scripts/grant_erp_readonly_legacy.sql`](../supabase/scripts/grant_erp_readonly_legacy.sql).
2. Remplacer `CHANGE_ME_STRONG_PASSWORD` (ou `ALTER ROLE erp_readonly PASSWORD '…'`).
3. Exécuter le script.
4. Vérifier : `bypass_rls = true`.

Sans **BYPASSRLS**, le sync ERP verra 0 courrier (RLS).

### 2. Vues d’export eligible + users/stats

1. Exécuter [`supabase/scripts/create_export_are_legacy_views.sql`](../supabase/scripts/create_export_are_legacy_views.sql).
2. Noter `export_are_migration_stats_v1` (totaux / éligibles / `mails_open` / `open_by_step`).

### 3. Vues d’export open (import natif) — obligatoire avant pilot

1. Exécuter [`supabase/scripts/create_export_are_native_open_views.sql`](../supabase/scripts/create_export_are_native_open_views.sql).
2. Vérifier smoke : `mails_open` ≈ 380, placement non vide, définition 9 étapes.

### 4. Audit readiness

1. Exécuter [`supabase/scripts/audit_legacy_migration_readiness.sql`](../supabase/scripts/audit_legacy_migration_readiness.sql).
2. Conserver : vues OK, `mails_open`, répartition par étape, placement sample.

### 5. Secrets à transmettre à l’ERP (canal sécurisé)

| Secret | Valeur |
|--------|--------|
| `ARE_LEGACY_DB_URL` | `postgresql://erp_readonly:<mdp>@db.<ref>.supabase.co:5432/postgres?sslmode=require` |
| `ARE_LEGACY_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `ARE_LEGACY_SERVICE_KEY` | service_role (Dashboard → Settings → API) — lecture Storage |
| `ARE_LEGACY_ORG_ID` | fourni par l’ERP (organisation cible) |

Joindre `SELECT * FROM export_are_users_v1` pour provisionner les UUID.

### 6. Annonce métiers

- Plus de **nouveaux** enregistrements sur ARE à partir de [date].
- Dual-run : dossiers importés restent `locked` côté ERP jusqu’au déverrouillage.

### 7. Boucle dual-run

```text
ARE : readiness (stats / audit)
  → ERP : legacy-are-import-native dry_run → pilot 10 → full par lots
  → ERP : vérifier inbox participants + étape + PJ
  → répéter / déverrouiller par lot
```

Compteur :

```sql
SELECT * FROM public.export_are_migration_stats_v1;
```

### 8. Fin de campagne

1. Stock ARE maîtrisé ; import natif + legacy audit verts.
2. ARE → lecture seule / gel métier.
3. Rotater `erp_readonly` / service key si besoin.

## Fichiers

| Fichier | Rôle |
|---------|------|
| `docs/migration-legacy-courriers-vers-erp-saas.md` | Brief complet |
| `docs/message-reponse-erp-import-natif.md` | Message à coller à l’IA ERP |
| `supabase/scripts/grant_erp_readonly_legacy.sql` | Rôle + BYPASSRLS |
| `supabase/scripts/create_export_are_legacy_views.sql` | Vues eligible + users + stats |
| `supabase/scripts/create_export_are_native_open_views.sql` | Vues open / placement / définition |
| `supabase/scripts/audit_legacy_migration_readiness.sql` | Comptages / qualité |
