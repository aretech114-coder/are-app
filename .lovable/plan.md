

# Plan : Mise à jour SAFETY_POLICY.md — Protocole migrations SQL manuelles

## Objectif

Ajouter une section dans le Safety Policy qui décrit le protocole de gestion des migrations SQL une fois GitHub activé. Ce protocole prévoit que pour toute modification structurelle (ajout/modification de tables, colonnes, RLS, fonctions RPC, triggers), un fichier SQL téléchargeable sera généré pour exécution manuelle dans le SQL Editor de la base de données.

## Ce qui change

**Fichier modifié : `SAFETY_POLICY.md`**

Ajout d'une nouvelle sous-section **D6. Migrations SQL contrôlées** dans la section D (Règles de sécurité), avec les règles suivantes :

1. **Mode actuel (pré-GitHub)** : Les migrations sont exécutées via l'outil de migration Lovable Cloud (comportement actuel, inchangé).
2. **Mode GitHub (à activer sur signal)** : Dès activation, toute migration structurelle (CREATE TABLE, ALTER TABLE, CREATE/ALTER FUNCTION, CREATE POLICY, etc.) génère un fichier `.sql` téléchargeable dans `/mnt/documents/migrations/`.
3. **Contenu du fichier** : Le SQL complet, commenté, prêt à copier-coller dans le SQL Editor.
4. **Vérification Safety Policy** : Avant chaque génération, vérifier les règles D1 (RLS, pas de migration destructive sans approbation, UUID, etc.).
5. **Nomenclature** : `YYYY-MM-DD_description.sql` (ex: `2026-04-11_add_color_columns_to_site_settings.sql`).
6. **Aucune exécution automatique** en mode GitHub — le collaborateur humain exécute manuellement après revue.

Mise à jour correspondante de la **mémoire projet** pour référencer cette règle.

## Fichiers impactés

| Fichier | Action |
|---------|--------|
| `SAFETY_POLICY.md` | Ajout section D6 |
| `mem://governance/safety-policy-ref` | Mise à jour référence |

## Statut

Le mode GitHub n'est **pas encore activé**. Les migrations continuent via l'outil Lovable Cloud jusqu'à signal explicite.

