

## Diagnostic

Lovable Cloud (preview `*.lovable.app`) montre les changements car il build directement depuis l'éditeur Lovable. Vercel, lui, déploie depuis votre repo GitHub — il faut donc que :

1. Les changements Lovable soient **poussés vers GitHub** (branche `develop` selon votre git flow)
2. Une **PR `develop` → `main`** soit mergée (car Vercel production déploie depuis `main`)
3. Vercel détecte le push et lance un nouveau build

## Vérifications à faire (côté utilisateur, je ne peux pas le faire à votre place)

1. **GitHub** : ouvrir le repo, vérifier que la branche `develop` contient bien les derniers commits avec les modifs de `Auth.tsx` (logo intégré dans la carte, glassmorphism, œil mot de passe) et la migration `site_settings`.
2. **Vercel Dashboard** :
   - Vérifier quelle branche est configurée comme "Production Branch" (probablement `main`)
   - Voir l'onglet "Deployments" : y a-t-il un build récent ? A-t-il réussi ou échoué ?
3. **Si rien n'arrive sur Vercel** :
   - Soit la PR `develop → main` n'a pas été mergée → la merger
   - Soit l'intégration GitHub ↔ Vercel est cassée → la reconnecter dans Vercel Settings

## Causes possibles côté code

Aucune. Le code Lovable est correct, l'image de fond fonctionne déjà sur le preview Lovable (visible sur votre capture). Le problème est purement **pipeline de déploiement Git → Vercel**.

## Actions que je peux faire (si vous approuvez)

Aucune action code n'est nécessaire — le code est bon. Il s'agit d'une opération Git/Vercel à faire manuellement de votre côté.

**Marche à suivre recommandée :**

1. Allez sur GitHub → vérifiez que la branche `develop` contient les derniers commits Lovable.
2. Créez (ou mergez si elle existe déjà) une PR **`develop` → `main`**.
3. Une fois mergée, Vercel devrait automatiquement déclencher un build sur `main` en 1-2 min.
4. Forcez un Ctrl+Shift+R sur `https://are-app.cloud` pour vider le cache navigateur.

Si après ces étapes Vercel ne se met toujours pas à jour, partagez-moi :
- Une capture de l'onglet **Deployments** de Vercel
- Le nom exact de votre branche de production Vercel

Je pourrai alors diagnostiquer plus précisément (cache Vercel, branche mal configurée, build échoué, etc.).

