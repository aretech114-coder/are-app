---
name: Git Flow Develop-First
description: Tout push Lovable va dans la branche develop, jamais dans main. Production via PR develop → main uniquement.
type: preference
---
## Règle Git Flow

- **Branche par défaut GitHub** : `develop` (configurée dans Settings → Default branch)
- **Lovable pousse vers** : la branche par défaut du repo = `develop`
- **main** : protégée, mise à jour uniquement via Pull Request `develop → main`
- **Aucun push direct vers main** — jamais, sous aucun prétexte
- L'utilisateur a configuré `develop` comme branche par défaut sur GitHub
