## Trois ajustements sur le Registre

### 1. Pop-up "Nouveau courrier" centré (au lieu d'un panneau latéral)

Actuellement `MailRegistrationSheet` utilise le composant `Sheet` (slide droite→gauche). Convertir en `Dialog` centré :
- Remplacer `Sheet/SheetContent/SheetHeader/SheetTitle/SheetDescription/SheetFooter` par `Dialog/DialogContent/DialogHeader/DialogTitle/DialogDescription/DialogFooter`.
- Largeur cible ≈ 50 % d'écran avec marges de 25 % de chaque côté : `max-w-[50vw]` (fallback `sm:max-w-2xl lg:max-w-3xl`) + `max-h-[85vh] overflow-y-auto`.
- Conserver tous les champs et la logique de soumission existante.
- Optionnel : renommer le fichier en `MailRegistrationDialog.tsx` (sinon garder le nom actuel pour limiter le diff). Je propose de **garder le nom de fichier** et de juste changer le composant interne, pour éviter de toucher l'import dans `RegistrePage.tsx`.

### 2. Bouton "Modifier" fonctionnel

`RegistrePage.handleEdit` affiche actuellement un toast "Édition disponible — module détaillé à venir". Or `MailEditDialog` existe déjà.
- Ajouter un state `editingMail` dans `RegistrePage`.
- `handleEdit(m)` : si `m.locked_for_edit` → toast d'erreur ; sinon `setEditingMail(m)`.
- Monter `<MailEditDialog mail={editingMail} open={!!editingMail} onOpenChange={(o)=>!o && setEditingMail(null)} onSaved={() => { setEditingMail(null); refetch(); }} />` en bas de la page.

### 3. Réassignation via sélection d'utilisateur (au lieu de `prompt` email)

`handleReassign` utilise `window.prompt` pour saisir un email. Le remplacer par une vraie modale :
- Nouveau state `reassignMailId: string | null` et `reassignTargetUserId: string | null`.
- Une `Dialog` qui affiche un `Select` (ou `Command/Combobox` recherchable) listant les utilisateurs assignables, chargés via `useQuery` sur `profiles` (`id, full_name, email`, triés par `full_name`).
- À la validation : exécuter la logique existante (révoquer les `pending`, insérer la nouvelle assignation, créer la notification, toast + refetch), en utilisant l'ID sélectionné directement (plus de lookup par email).
- Le bouton "Réassigner" du tableau ouvre la modale au lieu d'appeler `prompt`.

### Fichiers touchés

- `src/components/MailRegistrationSheet.tsx` — passage Sheet → Dialog centré.
- `src/pages/RegistrePage.tsx` — branchement `MailEditDialog`, nouvelle modale de réassignation, suppression du `prompt`.

### Hors périmètre

Aucune modification SQL / backend. Pure UI + branchement de composants existants.
