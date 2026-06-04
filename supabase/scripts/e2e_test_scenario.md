# Scénario de test E2E — workflow ARE (parcours 2 → 4 → 6 → 8 → 9)

Prérequis :

- Migrations **A–L** appliquées en Production ([`production_migrations_guide.md`](production_migrations_guide.md))
- [`workflow_are_config.sql`](workflow_are_config.sql) : UUID DG + secrétariat dans `workflow_step_responsibles`
- Frontend déployé, hard refresh navigateur

Étapes actives par défaut (migration **J**) : **2, 4, 6, 8, 9** — étapes 1, 3, 5, 7 désactivées.

Comptes : **Réception**, **DG** (`directeur` / `autorite_1`), **Conseiller A**, **Conseiller B** (non assigné), **Secrétariat**.

| # | Acteur | Action | Attendu |
|---|--------|--------|---------|
| 1 | Réception | Registre : N° courrier, réf. registre, circuit, heure dépôt (auto) | `reference_number` saisi ; `system_reference` CR-… ; `current_step = 2` |
| 2 | Conseiller B | Ouvrir la boîte de réception | **Aucun** courrier (non assigné) |
| 3 | DG | Étape 2 : valider **sans** cocher d'assigné | Bouton Confirmer **désactivé** ou erreur RPC |
| 4 | DG | Cocher A (traitement) + C (copie lecture seule), PJ optionnelle, Valider | `current_step = 4` ; A `contributor/pending` ; C `viewer/pending` ; notifs A + C |
| 5 | A | Voir le courrier en inbox (étape 4) | Visible |
| 5b | C | Boîte de réception + Suivi (historique) | Courrier visible **sans** bouton Soumettre |
| 6 | A | Soumettre traitement (`complete`) | OK ; si seul assigné → auto-avance vers **6** |
| 7 | DG | Validation étape 6 (`approve`) | `current_step = 8` |
| 8 | Secrétariat | Joindre preuve + confirmer (`complete`) | `current_step = 9` ou `archived` |
| 9 | DG (optionnel) | Étape 4 avec 2 assignés : A soumet, puis **Valider (DG)** `dg_advance` | Passe étape 6 **sans** attendre B |

## Vérifications complémentaires

- **Affichage dossier** : PJ réception dans le bloc É1 ; en-tête compact ; stepper repliable.
- Étape 4 : bouton **Soumettre mon traitement** (pas « Approuver » seul).
- Liste assignation étape 2 : tous les utilisateurs (RPC `list_assignable_users`).
- UI : libellés **DG** / **DGA**, pas « Ministre » dans les écrans courants.
- `list_my_mails` : message explicite si RPC absent.

## Contrôle SQL post-test

```sql
SELECT reference_number, current_step, status
FROM public.mails
WHERE reference_number = '<REF_TEST>';

SELECT step_number, assigned_to, status, access_mode
FROM public.mail_assignments
WHERE mail_id = (SELECT id FROM public.mails WHERE reference_number = '<REF_TEST>' LIMIT 1)
ORDER BY step_number;
```

## Audit Production

Exécuter [`production_audit.sql`](production_audit.sql) après migrations A–J.
