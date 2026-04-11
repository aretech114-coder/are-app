

# Plan : Provisionner aretech114@gmail.com comme SuperAdmin

## Contexte
L'utilisateur a été créé via Lovable Cloud. Son email est déjà confirmé (`email_confirmed_at` renseigné). Il manque :
1. Une entrée dans `profiles` (nécessaire pour que `useAuth` fonctionne)
2. Une entrée dans `user_roles` avec le rôle `superadmin`

## Actions (migration SQL)

**Une seule migration** qui insère :

```sql
-- Profil superadmin
INSERT INTO public.profiles (id, email, full_name, first_login)
VALUES ('d1935998-a7a7-4604-b195-be800557bd8d', 'aretech114@gmail.com', 'Super Admin', true);

-- Rôle superadmin
INSERT INTO public.user_roles (user_id, role)
VALUES ('d1935998-a7a7-4604-b195-be800557bd8d', 'superadmin');
```

## Résultat
- L'utilisateur pourra se connecter immédiatement sur la preview Lovable Cloud avec son email et mot de passe
- Il aura accès complet en tant que superadmin (toutes les permissions, gestion des utilisateurs, configuration système, workflow)
- `first_login: true` permettra de personnaliser le nom complet à la première connexion si cette logique existe

## Aucun fichier code modifié
Uniquement une insertion de données en base.

