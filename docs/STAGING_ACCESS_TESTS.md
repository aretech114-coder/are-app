# Tests manuels — visibilité courriers (Staging)

## Audit SQL (avant / après migration)

```sql
SELECT polname, polcmd
FROM pg_policy p
JOIN pg_class c ON c.oid = p.polrelid
WHERE c.relname = 'mails'
ORDER BY polname;
```

Attendu après `20260602120000_mail_access_gravity.sql` : policies principales `mails_select_by_access`, `mails_update_by_access` (+ insert/delete admin/réception).

## Matrice personas

| Persona | Ne doit pas voir | Doit voir / faire |
|---------|------------------|-------------------|
| Agent non assigné | Courrier aléatoire | Rien dans Inbox |
| Assigné proposed (étape 4, mail à l’étape 2–3) | Actions de traitement | Rien ou aperçu si `viewer` |
| Assigné contributor (étape 4) | Courriers non assignés | Traitement + sa contribution |
| DG `directeur` | Courriers jamais routés | Étapes 2, 4 (lecture contributions), 6 ; `dg_advance` |
| DirCab | Courrier bloqué en étape 2 seule | Étapes 3 et 5 |
| Admin / superadmin | — | Tous les courriers |

## Vérifications fonctionnelles

1. Enregistrer un courrier (réception) → visible réception uniquement à l’étape 1.
2. DG étape 2 : pré-assigner 2 agents + 1 lecteur en copie → Confirmer.
3. Agents non assignés : Inbox vide pour ce courrier.
4. À l’étape 4 : chaque assigné soumet sa contribution ; DG voit les brouillons/soumis sans attendre la fin collective.
5. DG : bouton « Valider (DG) — passer à l’étape suivante » (`dg_advance`).
6. Storage : upload PJ en étape 2 avec rôle `directeur` (migration `20260601120000`).

## RPC

```sql
SELECT public.can_access_mail('MAIL_UUID'::uuid, 'read');
SELECT * FROM public.list_my_mails(ARRAY['pending','in_progress']);
```
