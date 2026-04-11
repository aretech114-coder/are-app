

# Plan révisé : SAFETY_POLICY.md + Mémoires projet

## Correction principale : Git Flow

Le flux Git est corrigé comme suit :

```text
Lovable → develop (branch par défaut)
         ↓
    Pull Request : develop → main
         ↓
    Merge → main → Auto-deploy Vercel + Edge Functions
```

**Règle absolue** : Lovable ne pousse JAMAIS dans `main`. Tout commit va dans `develop`. Le merge vers `main` se fait uniquement via Pull Request approuvée, ce qui déclenche le déploiement production.

## Contenu du SAFETY_POLICY.md

### A. Identité
- Nom : ARE Platform
- Domaine production : `are-app.cloud`
- Deadline : présentation mardi (priorité haute, qualité maintenue)

### B. Posture agent
- Développeur senior full-stack + expert cybersécurité
- Garant qualité code (zéro deprecation), sécurité backend, stabilité production
- Chaque action passe par vérification SAFETY_POLICY avant exécution

### C. Méthodologie Git Flow
- Branche par défaut Lovable : `develop`
- Production : `main` (protégée, merge uniquement via PR depuis `develop`)
- Aucun push direct vers `main`
- Edge Functions + migrations : même flux (develop → PR → main → deploy)

### D. Règles de sécurité
1. Aucune migration destructive sans approbation
2. RLS obligatoire sur toute table
3. Edge Functions : JWT + validation rôle systématique
4. Aucun secret dans le code source
5. Validation inputs client ET serveur (Zod)
6. CORS restrictif en production
7. Notification des risques avant chaque action

### E. Checklist pré-PR (develop → main)
- RLS actives sur toutes les tables concernées
- Aucune requête sans pagination
- Pas de `console.log` de données sensibles
- Pas de `dangerouslySetInnerHTML` sans DOMPurify
- Zéro deprecation warning
- Tests fonctionnels validés sur preview

### F. Roadmap (inchangée)
- Phase 0 : Safety Policy + domaine + PWA setup
- Phase 1 : Workflow dynamique
- Phase 2 : Mobile-First & PWA
- Phase 3 : API & Intégrations
- Phase 4-5 : Modules métier + Multi-tenant

## Fichiers créés/modifiés

| Fichier | Action |
|---------|--------|
| `SAFETY_POLICY.md` | Création avec contenu ci-dessus |
| `mem://governance/safety-policy-ref` | Création — référence mémoire |
| `mem://infrastructure/domaine-production-fr` | Mise à jour → `are-app.cloud` |
| `mem://preference/git-flow-develop` | Création — règle develop-first |

## Important
- Aucun code applicatif modifié
- Aucune migration SQL
- La branche GitHub `develop` devra être créée manuellement par l'utilisateur (Lovable ne gère pas les branches par défaut)

