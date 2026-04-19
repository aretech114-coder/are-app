

## Compréhension de votre contexte

Vous avez raison, et c'est une information critique :
- Vous **n'utilisez pas** la CLI Supabase pour gérer les migrations
- Vous avez initialisé votre prod par **export/import SQL direct**
- Chaque changement passe par le **SQL Editor** manuellement
- Donc le schéma `supabase_migrations` n'existe pas → l'erreur `42P01` est logique

Le script que je vous ai fourni était basé sur une fausse hypothèse (que vous utilisiez la CLI). **Il ne faut PAS l'exécuter.**

## Vraie cause du problème GitHub Actions

Le workflow `.github/workflows/deploy-migrations.yml` lance `supabase db push`, qui :
1. Cherche `supabase_migrations.schema_migrations` → ne le trouve pas
2. Considère donc qu'**aucune** migration n'a été appliquée
3. Tente de rejouer **tout** le dossier `supabase/migrations/` depuis zéro
4. Échoue à la première création de type/table déjà existant (`app_role`)

## Solution alignée avec votre méthode (SQL Editor manuel)

Puisque vous gérez tout via SQL Editor, **le workflow GitHub Actions de migrations est inutile et nuisible** dans votre flux. Deux options propres :

### Option A — Désactiver le workflow de migrations (recommandée)
Renommer/désactiver `.github/workflows/deploy-migrations.yml` pour qu'il ne se déclenche plus. Vercel continue de déployer le frontend normalement, et vous appliquez les changements DB manuellement via SQL Editor comme d'habitude.

**Avantage** : zéro friction, cohérent avec votre méthode actuelle.
**Inconvénient** : pas de traçabilité automatique des migrations (mais vous l'aviez déjà accepté).

### Option B — Initialiser proprement le tracking pour utiliser la CLI à l'avenir
Créer le schéma `supabase_migrations` ET y insérer toutes les migrations existantes en une seule passe. C'est plus complexe et change votre workflow opérationnel.

## Ma recommandation

**Option A**, car :
- Elle reflète votre réalité opérationnelle
- Elle ne touche à **aucune** donnée prod
- Elle débloque immédiatement le déploiement Vercel
- Pour la nouvelle policy login (déjà appliquée d'après le schéma actuel), aucun SQL supplémentaire n'est nécessaire

## Plan d'implémentation (Option A)

1. **Modifier** `.github/workflows/deploy-migrations.yml` :
   - Soit le supprimer
   - Soit le mettre en mode manuel uniquement (`workflow_dispatch` au lieu de `push`)
   - Recommandation : mode manuel — on garde l'outil disponible pour le futur sans qu'il bloque les déploiements
2. **Vérifier** que `.github/workflows/deploy-functions.yml` (Edge Functions) reste actif — celui-là est utile
3. **Pousser** le changement vers `develop` puis merger vers `main`
4. **Vercel** redéploie automatiquement le frontend avec toutes les modifs Auth.tsx (logo intégré, glassmorphism, œil mot de passe)

## Procédure pour la policy login (séparée)

D'après le schéma fourni, la policy `Public can read login appearance settings` sur `site_settings` **est déjà active en production** (visible dans `<rls-policies>`). Donc rien à faire de ce côté — la page de login devrait déjà pouvoir lire `login_bg_image_url` et compagnie sans authentification.

## Ce qui n'est PAS touché

- Aucune table, aucune donnée, aucune RLS
- Aucun fichier de migration historique
- Aucun code applicatif
- Le workflow Edge Functions reste intact

## Risques

Aucun risque sur la base de données. Le seul "risque" est de perdre le déploiement automatique des migrations via Git — ce que vous ne souhaitez de toute façon pas puisque vous travaillez en SQL Editor manuel.

## Action requise de votre part après mon implémentation

Aucune sur la DB. Juste merger la PR `develop → main` pour que Vercel reprenne ses déploiements normalement.

