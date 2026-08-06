# Migration legacy des courriers ARE → plateforme ERP SaaS multi-tenant

**Statut :** brief d’accueil pour l’équipe / l’IA de la plateforme cible  
**Source :** application ARE (React/TypeScript + Supabase) — registre + workflow fixe 9 étapes  
**Cible :** plateforme SaaS multi-tenant modulaire (Lovable/Cursor) — Registre, Workflow builder, Form builder, RH, Comptabilité, etc. (~122 modules)  
**Volume prod actuel (ordre de grandeur) :** ~400 courriers (+ historiques, PJ, utilisateurs, avatars)  
**Objectif métier :** zéro perte, zéro interruption — les deux plateformes restent opérationnelles pendant la transition ; ensuite tout le travail neuf se fait sur l’ERP ; les anciens dossiers restent consultables en **legacy**.

**Emplacement dans le repo ARE :** `docs/migration-legacy-courriers-vers-erp-saas.md`

---

## 1. Intention (lire en premier)

Ce n’est **pas** une copie d’architecture ARE.

Il faut :

1. **Extraire** de la prod ARE toutes les données courrier utiles (mails, historique, PJ, users, profils/avatars, traces).
2. **Préparer** dans l’ERP une zone d’accueil **legacy** (schéma / tables / storage / UI lecture) adaptée au multi-tenant cible.
3. **Importer** sans altérer l’historique (dates, acteurs, étapes, fichiers).
4. **Exposer** ces dossiers facilement (recherche, fiche, timeline, téléchargements).
5. **Basculer** les utilisateurs vers les pratiques ERP (Form builder / Workflow builder / Registre natif) pour tout nouveau courrier.
6. Garder ARE **en ligne** jusqu’à validation complète (période de double run).

Le volume (~400 courriers) est **petit** : le risque n’est pas la perf, c’est le **mapping** (UUID, tenants, Storage paths, dual-format PJ).

**Runbook opératoire ARE :** [`docs/migration-legacy-are-runbook.md`](migration-legacy-are-runbook.md)

---

## 2. Stratégie progressive (statut éligible)

Bascule **par statut**, pas big-bang. Les équipes finalisent les dossiers ouverts sur ARE ; seuls les dossiers **à terme** sont synchronisés vers l’ERP en legacy. Les **nouveaux** courriers sont créés uniquement sur l’ERP natif.

### Critère d’éligibilité (figé)

Un courrier ARE est **éligible** à la sync legacy si et seulement si :

```sql
status = 'archived'
AND workflow_completed_at IS NOT NULL
```

### Dual-run

| Flux | Plateforme | Règle |
|------|------------|--------|
| Nouveaux courriers | ERP natif | Dès l’annonce métier |
| Dossiers ARE encore en cours | ARE | Finaliser jusqu’à archivage |
| Dossiers éligibles (terminés) | Sync → onglet Legacy ERP | `only_eligible=true` (défaut) |
| Reste non clos en fin de campagne | Sync exceptionnelle | `only_eligible=false` documentée |

### Côté ERP (contrat sync)

Modes attendus (alignés sur leur `legacy-are-sync`) :

- `dry_run` / `full` / `delta` avec **`only_eligible: true` par défaut**
- Compteurs admin : éligibles ARE / déjà importés / encore en cours sur ARE
- Job ou bouton « sync des terminés » ; mode exceptionnel pour tout migrer si besoin

Vues ARE prêtes : `export_are_mails_eligible_v1`, `export_are_*_eligible_v1`, `export_are_migration_stats_v1`  
(script [`supabase/scripts/create_export_are_legacy_views.sql`](../supabase/scripts/create_export_are_legacy_views.sql)).

### Message à coller à l’IA ERP (changement de stratégie)

```text
Changement de stratégie (prioritaire) :

1) Les NOUVEAUX courriers vont uniquement sur l’ERP natif.
2) Sur ARE, les équipes finalisent les dossiers en cours jusqu’à terme.
3) La sync legacy ne doit importer PAR DÉFAUT que les courriers ÉLIGIBLES :
   status = 'archived' AND workflow_completed_at IS NOT NULL
   (option only_eligible=true sur dry_run / full / delta).
4) Prévoir un compteur admin : éligibles ARE / déjà importés / encore en cours sur ARE
   (source possible : vue export_are_migration_stats_v1).
5) Job ou bouton « sync des terminés » (delta only_eligible) pour migrer au fil de l’eau.
6) Garder un mode exceptionnel pour tout migrer si certains dossiers ne peuvent pas être clos
   (only_eligible=false + vues export_are_*_v1 non filtrées).

Dual-run : ARE reste ouvert pour finir l’existant ; ERP pour le neuf + lecture Legacy des terminés.

Côté ARE : rôle erp_readonly + BYPASSRLS obligatoire (RLS actif sinon 0 ligne),
vues export_are_* , script grant_erp_readonly_legacy.sql.
Lire aussi attachment_urls jsonb ET marqueurs 📎 dans notes ; copier Storage clé-à-clé.
```

### Réponse au contrat ERP (`MIGRATION_LEGACY_ARE.md`)

- **OK** sur secrets, modes dry_run/full/delta/storage_only, upsert idempotent, UUID conservés, UI lecture seule, rollback par lot.
- **Compléter** : filtre `only_eligible` (stratégie progressive ci-dessus).
- **Critique ARE** : `GRANT SELECT` seul est insuffisant → le rôle `erp_readonly` doit avoir **`BYPASSRLS`** (voir [`supabase/scripts/grant_erp_readonly_legacy.sql`](../supabase/scripts/grant_erp_readonly_legacy.sql)).

---

## 3. Prompt maître (à coller dans Cursor/Lovable du projet ERP)

```text
Contexte
Tu es l’IA responsable de la plateforme ERP SaaS multi-tenant (modules : Registre courriers, Workflow builder, Form builder, RH, Comptabilité, etc.).
Une application legacy ARE (Supabase) a déjà ~400 courriers en production avec historiques de traitement, pièces jointes, utilisateurs et photos de profil.

Mission
Préparer l’infrastructure cible pour ACCUEILLIR ces données en legacy, sans perte, sans interruption de service, sans recopier l’architecture ARE.
Après migration, les utilisateurs travaillent uniquement avec les modules natifs ERP pour le neuf ; les dossiers ARE restent consultables (lecture riche).

Principes non négociables
- Zéro perte : mails, transitions, assignations, contributions, accusés, fichiers Storage, users, avatars, dates, acteurs.
- Zéro downtime métier : ARE et ERP opérationnels en parallèle pendant la transition.
- Préserver les UUID mail autant que possible (paths Storage contiennent mail_id).
- Préserver ou mapper 1:1 les UUID utilisateurs (sinon table user_id_map + rewrite FK).
- Multi-tenant : rattacher tous les imports à un tenant ERP clair (ex. tenant ARE / organisation cliente).
- Dual-read PJ : bucket+path prioritaires ; URLs signées peuvent être mortes ; notes legacy avec marqueurs 📎 à conserver.
- Ne pas forcer les 400 dossiers dans le Workflow builder tant que non validé : couche LEGACY_MAIL en lecture d’abord.

Livrables attendus de toi (dans CET ordre)
1) Décision d’accueil : schéma `legacy_are_*` (ou équivalent) + buckets Storage + index recherche + UI “Dossier legacy”.
2) Contrat d’extraction depuis ARE (vues SQL / export / pont lecture seule).
3) Plan de pont DB (read replica / FDW / sync ETL / scripts) pour période de transition.
4) Pipeline d’import idempotent (rejouable) + audits de réconciliation.
5) Runbook cutover : dual-run → gel écritures ARE (optionnel) → sync final → go-live ERP → ARE lecture seule → extinction.
6) Checklist QA sur un échantillon puis 100 % des ~400 mails.

Utilise le document technique “Migration legacy des courriers ARE → plateforme ERP SaaS multi-tenant”
(docs/migration-legacy-courriers-vers-erp-saas.md du repo ARE) comme source de vérité du système SOURCE.
```

### Prompt court (premier message)

```text
Lis et applique le brief “Migration legacy des courriers ARE → plateforme ERP SaaS multi-tenant”
(fichier docs/migration-legacy-courriers-vers-erp-saas.md du repo source ARE).

Contexte : ~400 courriers en prod ARE (Supabase). Notre ERP SaaS multi-tenant a déjà Registre + Workflow/Form builders. On n’importe PAS l’architecture ARE : on accueille les données en LEGACY consultable, puis tout le neuf se fait en natif ERP. Dual-run obligatoire (ARE + ERP) pendant la transition.

Commence par :
1) proposer le schéma d’accueil legacy + buckets + RLS multi-tenant ;
2) le contrat d’extraction / pont DB ;
3) le pipeline d’import idempotent ;
4) le runbook dual-run → cutover ;
5) la checklist QA pour 400 dossiers.

N’implémente le Workflow builder sur l’historique ARE qu’en phase 2 optionnelle. Priorité : zéro perte fichiers/historique/users/avatars.
```

---

## 4. Ce que la plateforme ERP doit préparer (infrastructure d’accueil)

### 4.1 Décisions produit / technique à figer avant import

| Décision | Recommandation |
|----------|----------------|
| Modèle d’accueil | Tables **legacy dédiées** (miroir ARE) + UI lecture ; **pas** rejeu dans Workflow builder au jour J |
| Tenant | Un `tenant_id` ERP unique pour l’organisation ARE (tous les ~400 mails rattachés) |
| Identité users | Idéal : mêmes UUID `auth.users` ; sinon map `are_user_id → erp_user_id` |
| Storage | Buckets dédiés `legacy-mail-incoming`, `legacy-mail-documents`, `legacy-ged-documents` **ou** mêmes noms avec préfixe tenant ; **conserver les object keys** |
| Écriture post-import | Legacy = **read-only** (sauf correction admin documentée) |
| Nouveaux courriers | Uniquement modules ERP natifs (Form/Workflow/Registre) |
| Recherche | Index sur référence, sujet, expéditeur, dates, acteurs |

### 4.2 Schéma d’accueil minimal (côté ERP)

Créer (noms indicatifs) :

- `legacy_are_mails`
- `legacy_are_mail_assignments`
- `legacy_are_workflow_transitions`
- `legacy_are_mail_contributions`
- `legacy_are_mail_workflow_documents`
- `legacy_are_ged_documents` (optionnel mais recommandé)
- `legacy_are_calendar_events` (si `mail_id` non null)
- `legacy_are_notifications` / `legacy_are_notification_deliveries` (optionnel)
- `legacy_are_audit_events` (optionnel, volumineux mais utile)
- `legacy_are_mail_inbox_reads` (optionnel UX)
- `legacy_are_user_map` (`are_user_id`, `erp_user_id`, `email`, `migrated_at`)
- `legacy_are_import_batches` (id batch, started_at, counts, checksums, status)

Colonnes critiques à prévoir sur les mails legacy (ne pas « simplifier ») :

- Identité / registre : `id`, `reference_number`, `registry_reference`, `system_reference`, `qr_code_data`
- Contenu : expéditeur, sujet, description, priorité, statut, direction, type, service cible, etc.
- Workflow snapshot : `current_step`, `deadline_at`, `workflow_started_at`, `workflow_completed_at`, `step8_*`, `ministre_absent`
- PJ : `attachment_url` + `attachment_urls` jsonb
- Acteurs : `registered_by`, `assigned_agent_id`
- Liens : `parent_mail_id`
- Multi-tenant ERP : `tenant_id` (+ éventuellement `source_system = 'are'`, `imported_at`, `import_batch_id`)

### 4.3 UI / module « Courriers legacy »

Écran(s) obligatoires :

1. **Liste** filtrable (~400 lignes) : référence, sujet, statut, étape, dates, acteurs.
2. **Dossier** : fiche registre + PJ téléchargeables + **timeline** chronologique + contributions étape 4 + accusés 8/9 + GED si présent.
3. Lien depuis le Registre ERP natif : badge « Legacy ARE » pour ne pas confondre avec les nouveaux dossiers.

Règle UX : l’utilisateur retrouve **son** historique (actions où `performed_by` / `assigned_to` / `user_id` = lui), y compris avatar.

### 4.4 Storage

| Bucket source ARE | Contenu | Action ERP |
|-------------------|---------|------------|
| `mail-incoming` | Scans enregistrement | Copie clé-à-clé |
| `mail-documents` | PJ workflow (`annotations/`, `treatments/`, `validations/`, `deposits/`, `archives/` + `{mailId}/…`) | Copie clé-à-clé |
| `ged-documents` | PDF dossiers | Copie clé-à-clé |
| `avatars` | Photos profil | Copie + rattachement profils ERP |

Post-copie : résoudre les téléchargements via **bucket + path** (régénérer signed URLs). Ne pas dépendre des anciennes URLs hébergées sur `*.supabase.co` du projet ARE.

---

## 5. Inventaire source ARE (extraire absolument)

### 5.1 Tables prioritaires (P0)

| Table | Pourquoi |
|-------|----------|
| `mails` | Hub courrier (~400) |
| `workflow_transitions` | Historique officiel des traitements / avances |
| `mail_assignments` | Qui était assigné (contributor / viewer / custodian) |
| `mail_contributions` | Corps + PJ des traitements étape 4 |
| `mail_workflow_documents` | Accusés / docs clôture 8–9 |
| `profiles` + `user_roles` + `auth.users` | Identité, rôles, avatars |
| Storage objets liés | Fichiers binaires |

### 5.2 Tables recommandées (P1)

`ged_documents`, `calendar_events` (mail-linked), `notifications`, `notification_deliveries`, `audit_events`, `mail_inbox_reads`, `mail_sub_assignments`, `mail_processing_history`, référentiels `mail_types`, `services_concernes` (pour libellés).

### 5.3 Détail colonnes — `mails` (hub)

| Colonne | Notes |
|---------|--------|
| `id` uuid PK | **À préserver** (paths Storage) |
| `reference_number` text UNIQUE | N° visible métier |
| `registry_reference` text | Réf. registre papier |
| `system_reference` text | Auto type `CR-YYYYMMDD-XXXX` (QR) |
| `qr_code_data` text | |
| Expéditeur / meta | `sender_name`, `sender_organization`, `sender_phone/email/address/city/province/country`, `subject`, `description`, `document_summary`, `comments`, `addressed_to` |
| `priority` / `status` | enums `mail_priority`, `mail_status` |
| `attachment_url` text | Legacy mono |
| `attachment_urls` jsonb | Multi-fichiers structurés |
| `direction` | `entrant` \| `sortant` |
| `target_service_id` | FK `services_concernes` |
| `province_code`, `mail_type`, `mail_type_other` | |
| `locked_for_edit`, `parent_mail_id` | |
| `current_step` (1–9), `deadline_at` | |
| `workflow_started_at`, `workflow_completed_at` | |
| `ministre_absent` | |
| `step8_arrived_at`, `step8_transmitted_at` | Auto-advance 8→9 |
| `outgoing_draft_html`, `ai_draft` | |
| `registered_by`, `assigned_agent_id` | → `auth.users` |
| `tenant_id` | nullable côté ARE |
| `is_read`, `created_at`, `updated_at`, `reception_date`, `deposit_time` | |

### 5.4 Détail — `workflow_transitions` (historique officiel)

| Colonne | Notes |
|---------|--------|
| `id`, `mail_id` | CASCADE vers mails |
| `from_step`, `to_step`, `action`, `performed_by`, `notes` | |
| `attachment_urls` jsonb `[]` | Multi-PJ structurés (migration AO) |
| `tenant_id`, `created_at` | |

Marqueurs legacy dans `notes` (à conserver tels quels) :

- `📎 Document joint: <url>`
- `📝 Annotation:`
- `👥 Personnes assignées:`
- `💬 Notes:`
- `📅 RDV planifié:`

Parser source : `src/lib/workflow-notes.ts`.

### 5.5 Détail — `mail_assignments`

| Colonne | Notes |
|---------|--------|
| `mail_id`, `assigned_to`, `assigned_by`, `step_number` | |
| `status` | `pending`, `proposed`, `completed`, … |
| `access_mode` | **`custodian` \| `contributor` \| `viewer`** (CHECK) |
| `instructions`, `completed_at`, `reminder_count`, `last_reminder_at`, `tenant_id` | |

### 5.6 Détail — `mail_contributions` (étape 4)

| Colonne | Notes |
|---------|--------|
| UNIQUE `(mail_id, user_id, step_number)` | |
| `body`, `attachment_urls` jsonb | |
| `status` | `draft` \| `submitted` |
| `processed_at`, `user_id` → `auth.users` | |

### 5.7 Détail — `mail_workflow_documents` (clôture 8/9)

| Colonne | Notes |
|---------|--------|
| `mail_id`, `step_number` IN (8,9) | |
| `document_type` | ex. `accuse_reception_sortant` |
| `storage_bucket` | défaut `mail-documents` |
| `storage_path`, `file_name`, `uploaded_by` | Unique `(storage_bucket, storage_path)` après migration multi-fichiers |

### 5.8 Enums utiles

| Enum | Valeurs principales |
|------|---------------------|
| `app_role` | `superadmin`, `admin`, `supervisor`, `agent`, `secretariat`, `archiviste`, `conseiller`, `reception`, `directeur`, `dg`, `dga`, `dircab`, … |
| `mail_priority` | `low`, `normal`, `high`, `urgent` |
| `mail_status` | `pending`, `in_progress`, `processed`, `archived` |
| `mail_type` | `standard`, `invitation`, `note_technique`, `accusé_reception` (+ texte libre / `mail_type_other`) |

### 5.9 Formats pièces jointes (dual)

- Structuré : jsonb `attachment_urls` = `[{ url, name?, path?, bucket? }, …]` sur `mails`, `mail_contributions`, `workflow_transitions`.
- Legacy texte dans `workflow_transitions.notes` : lignes `📎 Document joint: <url>`. **Ne jamais tronquer `notes`.**

### 5.10 Conventions de paths Storage

| Bucket | Pattern | Lié à |
|--------|---------|--------|
| `mail-incoming` | `{YYYY}/{MM}/{safeRef}/{timestamp}_{filename}` | `mails.attachment_urls` / `attachment_url` |
| `mail-documents` | `{subfolder}/{mailId}/{timestamp}_{filename}` | contributions, transitions, accusés |
| Sous-dossiers | `annotations` (2/3/5), `treatments` (4), `validations` (6), `deposits` (8), `archives` (9) | |
| `ged-documents` | `{mailId}/{sender}_{reference}.pdf` | `ged_documents.pdf_storage_path` |
| `avatars` | chemins profil | `profiles.avatar_url` |

Code source : `src/lib/mail-storage.ts`, `src/lib/workflow-engine.ts`, `src/lib/mail-workflow-documents.ts`.

### 5.11 Workflow source (compréhension historique uniquement)

| # | Nom | Trace typique |
|---|-----|----------------|
| 1 | Réception | `mails` + PJ `mail-incoming` |
| 2 | Traitement DG | transition + éventuel RDV + pré-assignations étape 4 |
| 3 | Filtrage stratégique | peut être sautée (`ministre_absent`) |
| 4 | Traitement multi-acteurs | `mail_assignments` + `mail_contributions` |
| 5 | Vérification | transitions / réassignations |
| 6 | Validation DG | PJ sous `validations/` |
| 7 | Consultation | acknowledgement |
| 8 | Retour & preuve de dépôt | `mail_workflow_documents` + `step8_*` |
| 9 | Archivage | `status=archived`, GED optionnelle |

Avancement source : RPC `advance_workflow_step`, `submit_step4_treatment`, `set_workflow_transition_attachments`, etc.  
**Côté ERP legacy : importer les lignes, ne pas rejouer les RPC.**

### 5.12 Edge Functions source (contexte)

`dispatch-workflow-notifications`, `send-notification-email`, `sla-checker`, `workflow-step8-auto-advance`, `generate-ged-dossier`.  
Importer les **données** associées si utile ; pas besoin de porter le code des functions.

### 5.13 Projets Supabase ARE

| Env | Project ref |
|-----|-------------|
| Develop | `kqdcsbrsrlufnpvithcg` |
| Production | `axgpnkxsiudiixalbuz` |

**Toujours migrer depuis la PROD** (ou un snapshot figé de la prod).

---

## 6. Pont entre les deux bases (période de transition)

Objectif : ARE et ERP **tous deux opérationnels** ; extraction des **éligibles** au fil de l’eau, sans couper le service.

### 6.1 Options

| Option | Description | Quand |
|--------|-------------|-------|
| **A. Snapshot + ETL** | Export data-only / sync full exceptionnelle | Cutover final (reste non clos) |
| **B. Lecture seule continue** | Rôle `erp_readonly` + jobs ERP `delta only_eligible` | **Dual-run recommandé** |
| **C. Foreign Data Wrapper** | Foreign tables vers ARE | Si peering / VPC |
| **D. API / Edge « export »** | Endpoint signé | Si pas d’accès SQL direct |

Recommandation :

1. **Dual-run :** `delta` + `only_eligible=true` (vues `*_eligible_v1`) sur cadence horaire/quotidienne.  
2. **Fin de campagne :** stock « en cours » ≈ 0 → sync exceptionnelle éventuelle → ARE lecture seule.

### 6.2 Contrat d’extraction (vues SQL côté ARE)

**Eligible / legacy** — [`supabase/scripts/create_export_are_legacy_views.sql`](../supabase/scripts/create_export_are_legacy_views.sql) :

| Vue | Usage |
|-----|--------|
| `export_are_mails_eligible_v1` | Sync legacy `only_eligible` |
| `export_are_mails_v1` | Mode exceptionnel (tous) |
| `export_are_transitions_eligible_v1` / `_v1` | Historique |
| `export_are_assignments_eligible_v1` / `_v1` | Assignations |
| `export_are_contributions_eligible_v1` / `_v1` | Traitements étape 4 |
| `export_are_closure_docs_eligible_v1` / `_v1` | Accusés 8/9 |
| `export_are_users_v1` | Provisionnement UUID (`role`, `roles`, `avatar_path`, `is_active`) |
| `export_are_storage_manifest_v1` | Manifest PJ des **éligibles** |
| `export_are_migration_stats_v1` | Compteurs (`mails_open`, `open_by_step`, …) |

**Ouverts / import natif** — [`supabase/scripts/create_export_are_native_open_views.sql`](../supabase/scripts/create_export_are_native_open_views.sql) :

| Vue | Usage |
|-----|--------|
| `export_are_mails_open_v1` | Courriers non terminés (cœur des ~380) |
| `export_are_mail_placement_v1` | `current_step` + `assignees` + `steps_state` + `primary_assignee_id` |
| `export_are_transitions_open_v1` | Historique des ouverts |
| `export_are_assignments_open_v1` | Assignations des ouverts |
| `export_are_contributions_open_v1` | Contributions des ouverts |
| `export_are_workflow_documents_open_v1` | Docs clôture des ouverts |
| `export_are_storage_manifest_open_v1` | Manifest PJ des ouverts |
| `export_are_workflow_definition_v1` | `are_step_1..9` + SLA + skippable |

Ouvert = `NOT (archived AND workflow_completed_at IS NOT NULL)`.

Rôle pont : [`supabase/scripts/grant_erp_readonly_legacy.sql`](../supabase/scripts/grant_erp_readonly_legacy.sql) (**BYPASSRLS** obligatoire).

Message ERP post-déploiement : [`docs/message-reponse-erp-import-natif.md`](message-reponse-erp-import-natif.md).

### 6.3 Idempotence

Chaque import ERP doit :

- utiliser `ON CONFLICT (id) DO UPDATE` (ou skip si inchangé),
- tracer un `import_batch_id`,
- pouvoir être **rejoué** sans dupliquer les dossiers déjà migrés.
- pour le natif : `workflow_instances.id = mails.id` + peupler `metadata.participants` depuis `assignees`.

---

## 7. Ordre d’import (runbook technique)

1. Préparer tenant ERP + schéma legacy + buckets + workflow `are_step_1..9`.  
2. Migrer / mapper utilisateurs + avatars (mêmes UUID) + org_roles.  
3. Appliquer vues ARE eligible **puis** open ; secrets pont.  
4. Annoncer : **nouveaux courriers uniquement sur ERP**.  
5. ERP `legacy-are-import-native` : dry_run → pilot 10 → full par lots (ouverts positionnés, `locked=true`).  
6. Filet : sync legacy `only_eligible` pour archivés.  
7. Déverrouillage progressif ; ARE lecture seule en fin de campagne.

Détail opératoire ARE : [`docs/migration-legacy-are-runbook.md`](migration-legacy-are-runbook.md).

---

## 8. Audits de non-régression (obligatoires)

Sur les dossiers **éligibles** (puis 100 % en fin de campagne) :

```text
□ COUNT éligibles ARE ≈ COUNT legacy ERP (hors stock encore en cours)
□ COUNT transitions / assignments / contributions alignés sur les ids importés
□ Manifest Storage : chaque (bucket, path) existe côté ERP
□ Spot-check 20 éligibles récents (multi-PJ, étape 4 multi-acteurs)
□ Éligibles sans mail_workflow_documents : écarts expliqués
□ Timeline lisible + PJ téléchargeables + acteurs nommés
□ Users : UUID identiques + avatars
□ Delta : un nouveau archived apparaît au sync suivant
□ Aucune écriture ERP native n’écrase une ligne legacy
```

Scripts ARE :

- `supabase/scripts/audit_legacy_migration_readiness.sql`
- `supabase/scripts/production_audit.sql`
- `supabase/scripts/audit_workflow_transition_attachment_urls.sql`

---

## 9. Sécurité & conformité

- Connexion pont : **read-only** (`erp_readonly` + **BYPASSRLS**) ; pas d’INSERT/UPDATE/DELETE.  
- `ARE_LEGACY_SERVICE_KEY` : lecture Storage uniquement côté job ERP ; rotater après cutover si possible.  
- RLS ERP : legacy visible seulement au `tenant_id` concerné + rôles autorisés.  
- Journaliser chaque `import_batch`.  
- Données personnelles : traiter comme prod.

---

## 10. Planning type (sans interruption)

| Phase | ARE | ERP | Durée indicative |
|-------|-----|-----|------------------|
| T0 Préparation | grant + vues export | schéma legacy + UI + `only_eligible` | 2–5 j |
| T1 Pont + dry_run | readiness audit | dry_run éligibles | 1–3 j |
| T2 Dual-run | finaliser dossiers ; **plus de nouveaux** | sync delta éligibles + ERP natif pour le neuf | 3–14 j+ |
| T3 Cutover stock | stock en cours ≈ 0 | delta final + exceptionnel si besoin | 0.5–1 j |
| T4 Hypercare | lecture seule | ERP natif + Legacy | 7–14 j |
| T5 Clôture | archive / gel | legacy conservé | — |

---

## 11. Fichiers source ARE à consulter pour détails fins

| Sujet | Chemins repo ARE |
|-------|------------------|
| Runbook migration progressive | `docs/migration-legacy-are-runbook.md` |
| Message réponse ERP (import natif) | `docs/message-reponse-erp-import-natif.md` |
| Rôle pont ERP | `supabase/scripts/grant_erp_readonly_legacy.sql` |
| Vues export eligible | `supabase/scripts/create_export_are_legacy_views.sql` |
| Vues export open / placement | `supabase/scripts/create_export_are_native_open_views.sql` |
| Audit readiness | `supabase/scripts/audit_legacy_migration_readiness.sql` |
| Guide migrations prod | `supabase/scripts/production_migrations_guide.md` |
| Gravity / contributions / assignments | `supabase/migrations/20260602120000_mail_access_gravity.sql` |
| Bootstrap workflow 9 étapes | `supabase/migrations/20260602180000_workflow_tables_bootstrap.sql` |
| Clôture 8–9 + docs | `supabase/migrations/20260616900000_workflow_steps_8_9_closure.sql` |
| Multi-PJ transitions | `supabase/migrations/20260728114000_workflow_transition_attachment_urls.sql` |
| Upload registre | `src/lib/mail-storage.ts` |
| Upload / RPC workflow | `src/lib/workflow-engine.ts` |
| Parse notes / PJ | `src/lib/workflow-notes.ts` |
| Accusés | `src/lib/mail-workflow-documents.ts` |
| UI timeline | `src/components/WorkflowTimeline.tsx`, `src/pages/HistoryPage.tsx` |

---

## 12. Anti-patterns (à interdire)

- Recréer les courriers via le Form builder (perte d’IDs, dates, acteurs).  
- Migrer seulement la table `mails`.  
- Migrer les dossiers **non archivés** par défaut (sauf exception documentée).  
- Changer les UUID mail après copie Storage.  
- Se fier aux signed URLs ARE.  
- Couper ARE avant validation audits ERP.  
- Mélanger sans badge les dossiers legacy et les dossiers ERP natifs.  
- Supprimer le contenu de `notes` des transitions.  
- Oublier `BYPASSRLS` sur `erp_readonly`.

---

## 13. Définition de « terminé »

La migration est réussie quand :

1. Tous les dossiers **éligibles** (+ éventuel lot exceptionnel) + historiques + fichiers + users/avatars sont dans l’ERP.  
2. Stock ARE « en cours » ≈ 0 (ou accepté et migré en exception).  
3. Un utilisateur ouvre n’importe quel dossier legacy et retrouve fiche + timeline + PJ.  
4. Les nouveaux courriers sont créés uniquement via les modules ERP.  
5. ARE peut passer en lecture seule sans plainte de perte.  
6. Audits de comptage / Storage verts et journalisés dans `legacy_are_import_batches`.

---

## 14. Contacts / prochains échanges entre les deux IA

L’IA ERP doit demander à l’équipe ARE :

1. Secrets : `ARE_LEGACY_DB_URL` (`erp_readonly`), `ARE_LEGACY_SUPABASE_URL`, `ARE_LEGACY_SERVICE_KEY`.  
2. Confirmation project ref prod.  
3. Confirmation vues `export_are_*` appliquées.  
4. Liste users (`export_are_users_v1`) pour provisionnement UUID.  
5. Fenêtre d’annonce « plus de nouveaux sur ARE » + rythme de sync delta.

---

## 15. Identité utilisateurs (détail)

- **Auth :** `auth.users.id` (uuid)  
- **`profiles.id`** = même uuid, FK → `auth.users` ON DELETE CASCADE  
- **Rôles :** `user_roles (user_id, role app_role, tenant_id?)`  
- FK à remapper si UUID changés : `mails.registered_by`, `assigned_agent_id`, tous `assigned_*` / `performed_by` / `user_id` / `uploaded_by` / `created_by` / `participant_ids`  

Préférer **préserver les UUID** entre projets, ou maintenir `legacy_are_user_map` et réécrire toutes les FK à l’import.

---

Fin du brief.
