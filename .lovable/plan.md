
# Plan — Alignement ARE sur l'Offre Technique HSolutions + PDF Cible

## 1. Compréhension du besoin

Vous souhaitez deux livrables :

1. **Un plan de restructuration progressif (2-3 jours pour les éléments principaux opérationnels, puis itérations)** qui aligne la plateforme ARE actuelle sur les ambitions de l'offre HSolutions, **sans casser la production** et **sans perte de données**.
2. **Un PDF distinct de la version uploadée** (design, ton, mise en page différents) qui présente **l'état cible (futur)** de la plateforme — comme si tous les modules étaient déjà en production — avec des arguments enrichis dépassant le document source.

Contraintes imposées :
- Ne mentionner ni Lovable, ni Vercel, ni Supabase. GitHub autorisé.
- Garder la stack actuelle telle quelle, sans entrer dans le détail DevOps.
- Respecter la structure narrative de l'offre source mais avec une identité visuelle nouvelle.

## 2. Cartographie : Offre HSolutions vs. État actuel ARE

| Pilier HSolutions | État actuel ARE | Écart | Stratégie |
|---|---|---|---|
| **IAM First (Keycloak SSO/MFA/OIDC)** | Auth Email/Password + rôles via `user_roles` + `has_role()` | Pas de SSO externe, pas de MFA natif | Phase 1 : activer **OIDC Microsoft Entra ID** (déjà documenté). Garder `user_roles` comme source de vérité RLS. Présenter le futur comme "IAM centralisé" sans nommer Keycloak. |
| **Biométrie (empreinte, faciale, MFA)** | Absent | Module entier à ajouter | Phase 3 : intégration future via Edge Functions + bornes. Décrit comme roadmap. |
| **HRMS** | Absent | Module entier | Roadmap. Décrit comme module futur s'appuyant sur les profils existants. |
| **GED & Archivage** | `mail-documents` bucket + `AttachmentViewer` (PDF/Word/Excel/images) | Base présente, classement à enrichir | Phase 2 : ajouter taxonomie, plan de classement, recherche full-text. |
| **Gestion du Courrier** | ✅ **Déjà couvert** (workflow 9 étapes, RLS, SLA, notifications) | Cœur opérationnel | Mis en avant comme **module phare déjà en production**. |
| **Intranet collaboratif** | Réunions + Missions + Notifications partiels | Annuaire + Wiki manquants | Phase 2 : ajouter annuaire interne + base de connaissances. |
| **Projets / Planification** | Missions + Calendrier | Vue Gantt manquante | Phase 3 : enrichissement de l'agenda. |
| **IA / OCR** | Assistant IA Gemini multimodal en place | OCR à formaliser | Phase 2 : formaliser pipeline OCR via Lovable AI sur documents entrants. |
| **Infrastructure souveraine RDC** | Cloud actuel (non nommé) | Décision stratégique client | Présenté comme "hébergement institutionnel maîtrisé, options de souveraineté disponibles" — sans s'engager sur un datacenter RDC. |
| **BI / Tableaux de bord** | Dashboard analytique Recharts + 7 KPI Suivi | Bonne base | Mis en avant comme déjà opérationnel. |
| **PKI / Signature électronique** | Absent | Module à ajouter | Phase 3 : roadmap. |

## 3. Phasage opérationnel (sans rupture)

### Phase 1 — Court terme (J+2 à J+3) — Éléments principaux opérationnels
**Objectif : activer les promesses immédiates de l'offre sans toucher au cœur production.**

1. **Activer le SSO Microsoft 365 (OIDC)** en parallèle de l'auth email/mot de passe (déjà documenté dans `ARE_Guide_Azure_M365.pdf`). Mode coexistence, aucune migration forcée.
2. **Renforcer la traçabilité** : vérifier que toutes les transitions critiques alimentent `workflow_transitions` (déjà le cas) et exposer un export d'audit.
3. **Documentation client** : livrer le PDF cible (livrable principal de cette demande).

### Phase 2 — Moyen terme (J+15 à J+45)
1. Module **Annuaire interne** (vue lecture des `profiles` enrichie).
2. Module **Base de connaissances** (Wiki simple, table `kb_articles` + RLS).
3. **Plan de classement GED** (taxonomie sur documents existants, pas de migration destructive).
4. **OCR formalisé** sur courriers entrants via Lovable AI (extraction texte indexable).
5. **MFA TOTP** optionnel pour les rôles sensibles (superadmin, dg, ministre).

### Phase 3 — Long terme (J+60 à J+180)
1. Module **HRMS** light (congés, absences, organigramme).
2. **Biométrie** via intégration tierce (bornes + API).
3. **Signature électronique** PKI sur courriers sortants.
4. **Vue projets/Gantt** sur missions.

### Garanties de non-régression
- Toutes les migrations SQL : `IF NOT EXISTS`, colonnes nullable ou avec défaut, jamais de DROP.
- Workflow courrier (production) : **non touché en Phase 1**.
- Auth email/password reste active en permanence (break-glass superadmin).
- Aucune migration jouée par CI : exécution manuelle SQL Editor (Staging → Prod) conformément à `SAFETY_POLICY.md`.

## 4. Propositions à valider AVANT toute action

| # | Décision à prendre | Recommandation HSolutions/Lovable |
|---|---|---|
| 1 | Activer OIDC Microsoft 365 en Phase 1 ? | Oui — non-bloquant, coexistence avec auth actuelle |
| 2 | Engager un module HRMS en Phase 2 ou 3 ? | Phase 3 (effort important) |
| 3 | Promettre un hébergement RDC dans le PDF cible ? | Formuler comme "options de souveraineté" sans s'engager |
| 4 | Inclure la biométrie dès le PDF cible ? | Oui, en module roadmap clairement identifié |
| 5 | Ton du PDF cible : institutionnel sobre OU commercial premium ? | Voir question ci-dessous |

## 5. PDF cible — Spécifications de design

**Différenciation imposée vs document source :**

| Aspect | Document source | PDF cible (proposé) |
|---|---|---|
| Palette | Bleu corporate + accents | **Deep Navy + Teal + Or** (cohérent avec mémoire projet) |
| Typographie | Sans-serif standard | **Serif élégant (titres) + Sans-serif (corps)** |
| Couverture | Texte centré classique | **Couverture pleine page avec bandeau diagonal + emblème** |
| Mise en page | Colonnes denses, blocs colorés | **Espace blanc généreux, encadrés fins, filets dorés** |
| Iconographie | Icônes pleines colorées | **Pictogrammes linéaires monochromes** |
| Pieds de page | Logo + numéro | **Filet + mention institutionnelle + pagination romaine** |
| Schémas | Diagrammes hub-and-spoke colorés | **Schémas en arborescence sobres, ASCII-like stylisés** |

**Structure de chapitres (réutilisée et enrichie) :**

1. Page de garde (ARE — État cible de la plateforme intégrée)
2. Préambule institutionnel
3. Vision et ambition stratégique
4. Architecture cible (4 couches : Accès / Identité / Métiers / Données)
5. Module **Gestion du Courrier** (mis en avant — opérationnel)
6. Module **GED & Archivage**
7. Module **Identité & Sécurité** (SSO, MFA, RBAC, audit)
8. Module **Intelligence & Analytique** (BI, KPI, IA assistant, OCR)
9. Module **Collaboration** (Réunions, Missions, Annuaire, Wiki)
10. Module **Ressources Humaines** (roadmap)
11. Module **Biométrie & Présences** (roadmap)
12. Module **Signature électronique & PKI** (roadmap)
13. Stack technique (sans citer Vercel/Supabase/Lovable — termes génériques : "plateforme React", "base PostgreSQL managée", "fonctions serverless", "CI/CD GitHub")
14. Souveraineté & options d'hébergement
15. Sécurité & conformité (RLS, RBAC granulaire, audit immuable)
16. Gouvernance des données & continuité (backups, RPO/RTO)
17. Trajectoire de déploiement (3 phases, non-disruptif)
18. Formation & accompagnement
19. Indicateurs de succès & SLA cibles
20. Conclusion — vision institutionnelle

**Arguments enrichis (dépassant le document source) :**
- Détail RLS multi-tenant (notre mémoire projet)
- Workflow dynamique configurable (advance_workflow_step centralisé)
- Fallback cascades en cas d'absence (existant)
- Suivi SLA avec récupération automatique au dépassement (existant)
- Traçabilité immuable via `workflow_transitions`
- Mode hors-ligne PWA mobile-first
- Impersonation administrative auditée
- API publique versionnée (`api-public` edge function)

**Sortie technique :**
- Génération via `reportlab` (Python).
- Sortie : `/mnt/documents/ARE_Plateforme_Etat_Cible_v1.pdf` (~22 pages).
- QA visuel obligatoire (pdftoppm + inspection page par page).
- `<lov-artifact>` à la fin pour téléchargement.

## 6. Ce qui sera livré dans ce loop (après votre approbation)

1. **PDF cible** `ARE_Plateforme_Etat_Cible_v1.pdf` dans `/mnt/documents/`.
2. **Aucune modification du codebase** (cette demande est documentaire).
3. Un message récapitulatif listant : ce qui est déjà opérationnel, ce qui est proposé Phase 1, ce qui nécessite votre arbitrage avant Phase 2/3.

## 7. Ce qui NE sera PAS fait sans nouvelle validation explicite

- Aucune migration SQL.
- Aucune activation OIDC Microsoft (séparée, sur demande).
- Aucun nouveau module backend.
- Aucune modification du workflow courrier en production.

---

**Questions à clarifier avant génération du PDF :**

- Confirmez-vous la palette **Deep Navy + Teal + Or** pour le PDF cible (cohérent avec l'identité ARE existante) ?
- Souhaitez-vous que les modules **roadmap** (HRMS, Biométrie, PKI) soient présentés comme **déjà disponibles** (vision projetée) ou clairement étiquetés **"phase ultérieure"** ?
- Le PDF doit-il inclure une section **chiffrée** (KPI cibles : 99.9% SLA, X agents, etc.) ou rester purement qualitatif ?
