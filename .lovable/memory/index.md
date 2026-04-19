# Memory: index.md
Updated: now

# Project Memory

## Core
ARE Platform — SaaS courrier ministériel. Domaine prod : are-app.cloud.
Git flow : develop → PR → main. Jamais de push direct vers main.
Consulter SAFETY_POLICY.md avant toute action. Zéro deprecation.
Expert cybersécurité : audit chaque changement, notifier risques avant exécution.

## Memories
- [Safety Policy](mem://governance/safety-policy-ref) — Gouvernance, sécurité, Git flow, checklist pré-PR
- [Git Flow develop-first](mem://preference/git-flow-develop) — Tout push vers develop, production via PR uniquement
- [Domaine production](mem://infrastructure/domaine-production-fr) — are-app.cloud (ancien mrhe-courrier.cloud)
- [CI/CD Edge Functions](mem://infrastructure/ci-cd-edge-functions-fr) — Déploiement des 9 fonctions Edge
- [Migrations SQL manuelles](mem://infrastructure/migrations-manuelles-sql-editor-fr) — SQL Editor uniquement, fichier .sql livré dans /mnt/documents/migrations/
- [Workflow ministériel](mem://features/workflow-ministeriel-details-fr) — Responsabilités hybrides statiques/dynamiques
- [Panneau contexte conseiller](mem://features/panneau-contexte-conseiller-fr) — TreatmentsList pour contributions
- [Routage ministre absent](mem://features/routage-ministre-absent-fr) — Bypass étape 2 si ministre absent
- [Impersonation admin](mem://auth/impersonation-administrative-fr) — Magic link pour accès aux comptes
- [Admin role dropdown](mem://auth/admin-role-dropdown-tier-fr) — Chargement à trois niveaux
- [Visualisation documents](mem://infrastructure/visualisation-documents-globale-fr) — AttachmentViewer PDF/Word/Excel/images
- [Révision DirCab](mem://features/revision-assignations-dircab-fr) — Autorité de révision sur assignations
- [Historique intervenant](mem://features/historique-et-suivi-intervenant-fr) — Vue consolidée par mail_id
- [Multi-assignation](mem://features/logic-multi-assignation-fr) — Validation collective étapes 4 et 7
- [Mobile-first PWA](mem://design/mobile-first-pwa-fr) — Approche mobile-first anticipée
- [Catégorisation champs](mem://ui/categorisation-champs-etapes-fr) — Blocs catégorisés par étape
- [Tableau de suivi](mem://features/tableau-de-suivi-fr) — 7 KPI pour Ministre/DirCab/Admin
- [Enregistrement courrier](mem://features/mail-registration-details-fr) — ID unique, numéro courrier libre
- [SLA oversight](mem://features/sla-oversight-fr) — Délais par étape, alertes
- [Workflow engine](mem://architecture/workflow-engine-centralization-fr) — advanceWorkflow centralisé
- [RPC transitions atomiques](mem://architecture/atomic-workflow-transitions-rpc-fr) — SECURITY DEFINER
- [Config responsables](mem://architecture/config-responsables-workflow-fr) — workflow_step_responsibles
- [Guide migration](mem://infrastructure/guide-migration-production-fr) — Vercel + Supabase
- [Notifications workflow](mem://features/workflow-notifications-logic-fr) — Emails sur transitions/SLA
- [SMTP config](mem://infrastructure/smtp-notifications-config-fr) — Hostinger SMTP
- [Permissions admin](mem://auth/permissions-admin-granulaires-fr) — admin_permissions table
- [RLS site_settings](mem://security/rls-site-settings-restriction-fr) — Lecture restreinte admin/superadmin
- [RPC add_app_role](mem://security/rpc-add-app-role-restriction-fr) — Exécution restreinte
- [Filtrage DirCab](mem://features/filtrage-strategique-dircab-fr) — Étape 3 révision
- [Rôle reception isolé](mem://auth/role-reception-isole-fr) — Enregistrement restreint
- [RLS Gravity Flow](mem://security/rls-visibility-gravity-flow-fr) — Accès par étape/rôle
- [Production readiness](mem://infrastructure/production-readiness-security-hardening-fr) — Durcissement complet
- [RLS anti-recursion](mem://security/rls-anti-recursion-mails-fr) — is_mail_registered_by helper
- [Sync utilisateurs](mem://features/synchronisation-utilisateurs-auth-fr) — Edge sync-users
- [Priorité production](mem://constraints/priorite-production-fr) — Stabilité avant tout
- [Création utilisateur](mem://auth/creation-utilisateur-robuste-fr) — Synchronisation Auth/Profiles/Roles
- [Politique mots de passe](mem://security/politique-mots-de-passe-fr) — Min 6 caractères
- [Persistance session](mem://auth/persistance-session-refresh-fr) — useAuth chargement rôle
- [Routage SPA Vercel](mem://infrastructure/routage-spa-vercel-fr) — vercel.json rewrites
- [Auth Edge Functions](mem://infrastructure/auth-edge-functions-claims-fr) — Stratégie hybride JWT
- [Stockage sanitisation](mem://infrastructure/stockage-et-sanitisation-fr) — 3 buckets Storage
- [Configuration système](mem://features/configuration-systeme-fr) — Identité visuelle paramétrable
- [Agenda réunions](mem://features/agenda-et-reunions-fr) — Événements liés aux courriers
- [RBAC model](mem://auth/security-and-rbac-model-fr) — 11 rôles hiérarchiques
- [Protection XSS IA](mem://security/protection-xss-impression-fr) — Sanitisation contenu IA
- [Excel reporting](mem://infrastructure/reporting-excel-security-fr) — exceljs au lieu de xlsx
- [Expérience connexion](mem://auth/experience-connexion-fr) — Se souvenir de moi
- [Provisioning superadmin](mem://auth/provisioning-superadmin-fr) — Premier inscrit = superadmin
- [Inscription restreinte](mem://auth/inscription-restreinte-fr) — Pas d'inscription publique
- [Étape 8 secrétariat](mem://features/workflow-etape-8-secretariat-fr) — Retour & preuve de dépôt
- [Assistant IA](mem://features/assistant-ia-fr) — Gemini Flash multimodal
- [Missions](mem://features/missions-details-fr) — Suivi déplacements officiels
- [Assignation étape 2](mem://constraints/assignation-utilisateurs-fr) — Ministre assigne conseillers
- [Audit QR code](mem://features/audit-et-identification-fr) — QR unique par courrier
- [Dashboard analytique](mem://features/dashboard-analytique-fr) — KPI Recharts
- [Esthétique layout](mem://style/esthetique-layout-fr) — Deep Navy and Teal, light/dark
- [Interface Inbox](mem://features/interface-inbox-details-fr) — Deux panneaux, preview docs
- [RLS profils superadmin](mem://auth/rls-profils-superadmin-fr) — CRUD complet superadmin
- [Rôles dynamiques](mem://auth/dynamic-role-management-fr) — Ajout rôles à la volée
- [Multi-tenant fonctionnel](mem://features/multi-tenant-fonctionnel-fr) — Isolation données par organisation, gestion UI
