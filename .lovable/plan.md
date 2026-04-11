

# Plan révisé : Corrections sécurité + SAFETY_POLICY + Présentation PowerPoint

## Clarification naming — ARE App

ARE = **Autorité de Régulation du Secteur de l'Électricité**. La solution s'appelle **ARE App** — c'est le nom du projet conçu pour eux. On présente naturellement les fonctionnalités de ARE App sans ambiguïté sur la propriété du nom.

---

## A. Mise à jour SAFETY_POLICY.md

Ajouter section **D7. Continuité et intégrité des données** :
- Migrations non-destructives (`IF NOT EXISTS`, jamais de `DROP` sans clause WHERE)
- Idempotence obligatoire
- Rollback documenté pour chaque migration critique

---

## B. Corrections sécurité (82 → 90+/100)

### B1. Migration SQL
- **Avatars bucket** : Restreindre DELETE/UPDATE aux fichiers de l'utilisateur propriétaire
- **user_roles** : Empêcher l'escalade admin → superadmin dans le WITH CHECK
- **mail-documents** : Ajouter politique UPDATE explicite

### B2. Edge Function
- `impersonate-user/index.ts` : remplacer `mrhe-courrier.cloud` → `are-app.cloud`

---

## C. Présentation PowerPoint — ARE App (14 slides)

| # | Slide | Contenu |
|---|-------|---------|
| 1 | Couverture | ARE App — Plateforme de gestion du courrier ministériel |
| 2 | Le constat | Problèmes actuels : suivi manuel, pertes, délais |
| 3 | ARE App | Workflow automatisé, traçabilité totale |
| 4 | Workflow intelligent | 8 étapes, de la réception à l'archivage |
| 5 | Application mobile | iOS et Android, accès instantané |
| 6 | Gestion des rôles | 11 niveaux de responsabilité |
| 7 | Modules intégrés | Missions, Réunions, Assistant IA, Notifications |
| 8 | Modules à venir | CRM, RH, Comptabilité, Parapheur, Archivage légal |
| 9 | Sécurité multicouche | Chiffrement, audit trail, isolation, Cloudflare |
| 10 | Multi-organisation | Données cloisonnées par entité |
| 11 | API & Intégrations | API REST, connecteurs futurs |
| 12 | Tableau de bord | KPI temps réel |
| 13 | Pourquoi ARE App ? | Comparatif papier/Excel vs solution digitale |
| 14 | Prochaines étapes | Déploiement, formation, accompagnement |

**Design** : Deep Navy (#1E2761) + Teal (#0EA5E9), Georgia/Calibri. Présentation en français.

---

## Fichiers impactés

| Fichier | Action |
|---------|--------|
| `SAFETY_POLICY.md` | Section D7 continuité des données |
| Migration SQL | Fix storage avatars + user_roles + mail-documents |
| `supabase/functions/impersonate-user/index.ts` | Domaine are-app.cloud |
| `/mnt/documents/ARE_App_Presentation.pptx` | Présentation 14 slides |

