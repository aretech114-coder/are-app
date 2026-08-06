# Message à coller à l’IA ERP — imports open prêts

> À envoyer **après** avoir exécuté en prod :  
> `grant_erp_readonly_legacy.sql` (maj) → `create_export_are_legacy_views.sql` → `create_export_are_native_open_views.sql` → audit readiness.

---

```text
ARE — livrables open pour legacy-are-import-native

Contexte validé :
- Votre fonction legacy-are-import-native (dry_run / pilot 10 / full) + panneau Migration Legacy ARE est prise en compte.
- Côté ARE, les vues d’export pour les courriers OUVERTS (import natif positionné) sont déployées.

Définition OUVERT (alignée) :
  NOT (status = 'archived' AND workflow_completed_at IS NOT NULL)

Vues disponibles (GRANT SELECT à erp_readonly + BYPASSRLS) :
1) export_are_mails_open_v1
2) export_are_mail_placement_v1
   — mail_id, current_step, status, assignees[] (JSON), steps_state, primary_assignee_id
   — primary_assignee_id = contributor pending/proposed de l’étape courante, sinon 1er assignee étape
   — assignees = TOUS les assigned_to (toutes étapes) → à fusionner dans metadata.participants
3) export_are_transitions_open_v1
4) export_are_assignments_open_v1
5) export_are_contributions_open_v1
6) export_are_workflow_documents_open_v1
7) export_are_storage_manifest_open_v1 (bucket, path, step_number, kind)
8) export_are_workflow_definition_v1 (are_step_1..9, label, default_role, sla_hours, skippable)
9) export_are_users_v1 enrichi : id, email, full_name, role, roles[], avatar_url, avatar_path, is_active
10) export_are_migration_stats_v1 enrichi : mails_open, open_by_step (+ éligibles legacy)

Contrat d’import rappelé :
- workflow_instances.id = mails.id (idempotent)
- current_step_id = 'are_step_' || current_step
- peupler metadata.participants avec TOUS les assigned_to du JSON assignees
- assigned_to ERP = primary_assignee_id (étape courante)
- access_mode : contributor→editor, viewer→viewer, custodian→editor + metadata.custodians[]
- dual-run : metadata.legacy_sync.locked = true jusqu’au déverrouillage explicite
- timeline : tables legacy_are_* jointes par mail_id = instance.id (OK)

Prochaine action demandée de votre côté :
1) Confirmer lecture des vues (dry_run import natif) — comptages = export_are_migration_stats_v1.mails_open / open_by_step
2) Lancer PILOT 10 dossiers (idéalement étapes variées 2 / 4 / 6 / 8)
3) Go/No-Go pilot :
   (a) bonne étape are_step_N
   (b) chaque assigned_to voit le dossier dans son espace
   (c) viewers en lecture seule
   (d) PJ ouvrables
   (e) timeline / historique ARE visible
   (f) rejeu = 0 doublon
4) Avant masse (~380) : V2 users UUID (ou user_map) à 100 %
5) Puis full par lots de 50 + audit

Filet V0 : only_eligible / vues *_eligible_v1 restent valides pour les archivés.

Merci de renvoyer le résultat dry_run + pilot (écarts éventuels sur colonnes / mapping form_data).
```
