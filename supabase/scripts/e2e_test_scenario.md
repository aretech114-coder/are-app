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
| 8 | Secrétariat | **Transmettre à l'archivage** sans PJ (`complete`) | `current_step = 9`, statut **pas** `archived` |
| 9 | Archiviste | Archiver **sans** accusé | **Refus** RPC / bouton désactivé |
| 10 | Archiviste | Joindre accusé + `archive` | `status = archived` |

## Scénarios étapes 8→9 (T15–T20)

Prérequis : migrations **AJ** (+ **AK** pour T20 GED), frontend déployé, comptes **Secrétariat**, **Archiviste**.

| # | Acteur | Action | Attendu |
|---|--------|--------|---------|
| T15 | Secrétariat | Étape 8 : **Transmettre à l'archivage** sans PJ | `current_step = 9` ; toast « Dossier transmis » ; pas d'erreur |
| T16 | Archiviste | Étape 9 : tenter **Archiver** sans accusé | Bouton Confirmer **désactivé** ou toast/refus RPC |
| T17 | Archiviste | Joindre accusé à l'étape 9 puis **Archiver** | `status = archived` ; visible Archives |
| T18 | Secrétariat | Joindre accusé à l'étape 8 puis transmettre ; archiviste archive sans re-upload | Archive OK ; panneau accusé « Déposé à l'étape secrétariat » |
| T19 | Secrétariat | Rédiger brouillon, **Enregistrer**, **Imprimer en-tête**, **Export Word** sans transmission | `outgoing_draft_html` persisté ; pas de changement d'étape |
| T20 | Admin | `step8_auto_advance_hours = 1` ; courrier step 8 sans transmission > 1 h ; cron `workflow-step8-auto-advance` | Passage auto à étape 9 ; note transition « Passage automatique » |

### T20 — GED (optionnel, migration AK)

| # | Acteur | Action | Attendu |
|---|--------|--------|---------|
| T20b | Super admin | Activer **GED** dans Intégrations | Menu **GED** visible |
| T20c | Archiviste | Archiver avec module GED actif | Ligne `ged_documents` + PDF téléchargeable |

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
