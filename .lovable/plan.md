

# Plan : Configuration Git Flow Develop-First

## Objectif
Configurer définitivement le workflow Git pour que **tout push Lovable aille vers `develop`**, jamais vers `main`. Main reste réservée aux PR approuvées.

## État actuel
- Remote GitHub (secondary) : uniquement `main` visible
- Lovable pousse actuellement vers `main` par défaut
- La branche `develop` existe sur GitHub côté web mais n'est pas synchronisée avec l'environnement Lovable

## Actions à réaliser

### 1. Création de la branche develop locale
- Créer `develop` à partir de `main` actuel
- Configurer upstream vers `secondary/develop`

### 2. Push initial vers GitHub
- Pousser `develop` vers le remote `secondary` (GitHub)
- Vérifier que la branche est bien créée côté GitHub

### 3. Configuration Git locale
- Changer la branche par défaut locale à `develop`
- Configurer `git push` pour toujours pousser vers `develop` sur `secondary`
- Mettre à jour `origin` (S3 Lovable) pour refléter la nouvelle branche par défaut

### 4. Création du fichier mémoire
- Créer `.lovable/memory/preference/git-flow-develop.md` avec la règle : **"TOUT push vers develop, jamais vers main"**

### 5. Vérification finale
- `git branch -vv` pour confirmer que develop track bien `secondary/develop`
- Test avec un commit vide pour valider le flux

## Fichiers impactés
| Fichier/Action | Description |
|----------------|-------------|
| Commandes Git | Création branche develop, configuration upstream |
| `.lovable/memory/preference/git-flow-develop.md` | Mémoire : règle develop-first |
| Git config local | Branche par défaut = develop, remote = secondary |

## Après ce plan
- ✅ Tout push Lovable ira vers `develop`
- ✅ `main` reste protégée, mises à jour uniquement via PR
- ✅ Mémoire projet mise à jour pour tous les futurs agents

