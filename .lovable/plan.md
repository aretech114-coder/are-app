

# Plan de correction sécurité — ARE Platform

## Contexte
L'audit révèle 4 failles critiques RLS et des erreurs de build dans les Edge Functions. Toutes les corrections sont **non-destructives** : elles resserrent les accès sans casser la structure existante.

## Étape 1 — Corriger les erreurs de build des Edge Functions

Fichiers concernés (8 fonctions) :

- `ai-assistant/index.ts` : supprimer la redéclaration `const supabaseUrl` ligne 60, remplacer `getClaims(token)` par `getUser(token)`
- `create-user`, `delete-user`, `impersonate-user`, `manage-roles`, `sla-checker`, `sync-users`, `update-user` : remplacer `err.message` par `(err as Error).message` dans les blocs catch

## Étape 2 — Corriger les policies tenant isolation (migration SQL)

Modifier les 4 policies de tenant isolation sur `mails`, `mail_assignments`, `workflow_transitions`, `notifications` :

**Avant :**
```sql
(tenant_id IS NULL) OR (get_user_tenant_id(auth.uid()) IS NULL) OR (tenant_id = get_user_tenant_id(auth.uid()))
```

**Après :**
```sql
(tenant_id IS NULL) OR (tenant_id = get_user_tenant_id(auth.uid()))
```

Cela empêche un utilisateur sans tenant de voir toutes les données.

## Étape 3 — Resserrer la policy notifications

Supprimer la policy `Tenant isolation notifications` redondante (le scope `user_id = auth.uid()` des autres policies suffit).

## Étape 4 — Protéger user_roles contre l'escalade admin

Modifier la policy DELETE admin sur `user_roles` pour interdire la suppression de rôles `admin` :

```sql
has_role(auth.uid(), 'admin') AND role <> 'superadmin' AND role <> 'admin'
```

## Ce qui n'est PAS touché (avertissements à traiter plus tard)
- Listing des buckets publics (cosmétique, pas critique)
- Profils lisibles par tous les rôles (fonctionnel pour le workflow)
- Documents mail-documents sans scope par document (nécessite refonte storage policies)

## Résultat attendu
- Score sécurité passera de **6.5/10** à environ **8.5/10**
- Build des Edge Functions corrigé (les 14 erreurs TypeScript disparaissent)
- Aucun impact sur le fonctionnement existant

