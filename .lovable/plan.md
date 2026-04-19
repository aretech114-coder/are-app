

# Plan — Fond image translucide + œil mot de passe

## Diagnostic du problème de fond blanc

La page `Auth.tsx` lit `login_bg_image_url` depuis la table `site_settings` via `useSiteSettings`. Cependant, d'après la mémoire `rls-site-settings-restriction-fr`, **la lecture (SELECT) sur `site_settings` est restreinte aux rôles admin/superadmin**. Sur la page de connexion, l'utilisateur n'est **pas authentifié** → la requête renvoie `[]` → `login_bg_image_url` reste vide → fond blanc.

Ce n'est donc **pas un problème de cache Vercel**, mais un problème RLS qui se manifeste uniquement pour les visiteurs anonymes.

## Étape 1 — Autoriser la lecture publique des settings d'apparence (migration SQL)

Ajouter une policy RLS qui permet aux utilisateurs **anonymes** de lire uniquement les clés d'apparence publique nécessaires à la page de connexion :

```sql
CREATE POLICY "Public can read login appearance settings"
ON public.site_settings
FOR SELECT
TO anon, authenticated
USING (setting_key IN (
  'site_title','site_subtitle','sidebar_initials','sidebar_logo_url',
  'favicon_url','primary_color','login_bg_color','login_bg_image_url',
  'show_remember_me','show_forgot_password'
));
```

Cela ne révèle aucune donnée sensible (uniquement le branding visible sur la page de connexion) et conserve la restriction admin pour les autres clés.

## Étape 2 — Effet glassmorphism sur la carte de connexion

Modifier `src/pages/Auth.tsx` pour appliquer un fond translucide flouté à la `Card` quand une image de fond est présente :

- Remplacer l'overlay sombre `bg-black/40` par un dégradé plus léger
- Ajouter à `<Card>` les classes : `bg-card/60 backdrop-blur-xl border-white/20 shadow-2xl` (uniquement si `hasBgImage`)
- Garder texte/inputs bien lisibles

## Étape 3 — Icône œil pour afficher/masquer le mot de passe

Dans `Auth.tsx` :
- Ajouter un état `showPassword`
- Importer `Eye`/`EyeOff` depuis `lucide-react`
- Rendre un bouton positionné à droite de l'input mot de passe qui bascule `type="password"` ↔ `type="text"`
- Ajuster le padding droit de l'input (`pr-10`)

## Étape 4 — Appliquer la même amélioration aux pages liées

Pour cohérence, appliquer le même traitement (fond + glassmorphism) aux pages :
- `ForgotPasswordPage.tsx`
- `ResetPasswordPage.tsx` (avec aussi l'œil sur les champs mot de passe)

## Ce qui n'est PAS touché

- Logique d'authentification inchangée
- Aucun autre RLS modifié
- Aucun composant UI partagé modifié

## Résultat attendu

- L'image de fond définie dans Configuration Système s'affiche immédiatement sur la page de connexion (même non connecté, en production Vercel)
- La carte du formulaire devient translucide avec effet flou (glassmorphism)
- Œil cliquable pour afficher/masquer le mot de passe sur Auth + Reset

