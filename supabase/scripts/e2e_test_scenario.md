# Scénario de test E2E — workflow DG (demain matin)

Prérequis : migrations **F** et **G** appliquées en Production (`20260602200000`, `20260602210000`), frontend déployé, hard refresh navigateur.

Comptes : **Réception**, **DG** (`directeur` / `ministre` / `dg` / `autorite_1`), **Conseiller A**, **Conseiller B** (non assigné au départ).

| # | Acteur | Action | Attendu |
|---|--------|--------|---------|
| 1 | Réception | Enregistrer un courrier entrant (sans intérim) | Étape 2, assignation DG, notification DG |
| 2 | Conseiller non assigné | Ouvrir la boîte de réception | **Aucun** courrier visible |
| 3 | DG | Étape 2 : assigner A + B, valider (Approuver) | Étape 4, 2 assignations `contributor` / `proposed` |
| 4 | A | Soumettre traitement + PJ | Contribution visible nominative ; notification DG |
| 5 | DG | Voir panel contributions + **Valider (DG)** (`dg_advance`) | Passe étape 5 **sans** attendre B |
| 6 | Réception | Nouveau courrier : toggle **DG absent** + choisir utilisateur X | X voit le courrier aux étapes 2–6 |

## Vérifications complémentaires

- Étape 4 : bouton **Soumettre mon traitement** (action `complete`), pas « Approuver ».
- Étape 7 : bouton **Confirmer la consultation** (action `acknowledge`).
- UI : libellés **DG** / **DGA**, pas « Ministre » / « DirCab » dans les écrans.
- `list_my_mails` : si RPC absent, message d'erreur explicite (pas de liste complète des courriers).

## Audit SQL Production

Exécuter [`production_audit.sql`](production_audit.sql) jusqu'à **GO** sur toutes les sections après migrations A–G.
