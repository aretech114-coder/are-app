---
name: Multi-tenant fonctionnel
description: Isolation des données par organisation via tenant_id sur toutes les tables principales, avec gestion UI dans SystemConfigPage et assignation dans AdminPage.
type: feature
---
- Colonne `tenant_id` (nullable, FK vers `tenants`) ajoutée à : `profiles`, `user_roles`, `notifications`, `mail_assignments`, `workflow_transitions`, `missions`, `calendar_events`, `mails`
- Fonction `get_user_tenant_id(uuid)` SECURITY DEFINER retourne le tenant_id du profil
- Indexes créés sur toutes les colonnes tenant_id
- `useAuth` expose `tenantId` dans le contexte
- `useTenant` hook utilitaire avec `applyTenantFilter()` et `shouldFilterByTenant`
- SystemConfigPage : section "Organisations" pour créer/activer/désactiver des tenants (superadmin)
- AdminPage : dropdown "Organisation" dans le dialog d'édition utilisateur (superadmin)
- IntegrationsPage : module "Multi-tenant" marqué comme "Actif"
