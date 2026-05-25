# Refonte du module « Registre des courriers »

Fusion de l'écran d'enregistrement (`/mail-entry`) et du registre réception (`/reception-dashboard`) en un seul workspace unifié, conforme à la maquette cible, avec règles métier strictes (verrouillage édition, multi-province RLS, paramétrage dynamique).

## 1. Restructuration de l'app

- **Supprimer** l'entrée sidebar « Enregistrement » et la route `/mail-entry` (page conservée comme composant interne réutilisable, ou supprimée).
- **Renommer** « Registre » → route unique `/registre` (alias rétro-compat de `/reception-dashboard`).
- **Nouveau composant** : `src/pages/RegistrePage.tsx` (workspace unifié).
- Sidebar : un seul item « Registre » (icône `ClipboardList`), visible pour `reception`, `admin`, `superadmin`.

## 2. Header & actions globales

```
Registre des courriers                      [CSV] [Exporter PDF] [Paramètres] [+ Nouveau courrier entrant]
Enregistrement officiel ISO 9001 / 15489 — entrants et sortants.
```

- Le bouton principal est **contextuel** : « + Nouveau courrier entrant » sur onglet Entrants, « + Nouveau courrier sortant » sur Sortants.
- Le clic ouvre un **Sheet** (shadcn `Sheet`, side=right, largeur ~640px) contenant le formulaire d'enregistrement (champs actuels de `MailEntry.tsx` réorganisés en sections, plus `direction`, `target_service`, `assigned_workflow_path`).
- **CSV / Exporter PDF** : export du registre filtré courant (Excel via `exceljs` déjà installé ; PDF via `jspdf` + `jspdf-autotable`).
- **Paramètres** (icône engrenage) : dialogue admin-only avec deux onglets « Types de courriers » et « Services concernés » → CRUD sur deux nouvelles tables (cf. §6).

## 3. Onglets + KPI réactifs

- `Tabs` shadcn juste au-dessus du tableau : `📥 Entrants` / `📤 Sortants`.
- Rangée de 4 cartes métriques au-dessus des filtres :
  - **Entrants/Sortants ce mois** (libellé contextuel selon onglet)
  - **En attente** (statut `pending`)
  - **SLA dépassé** (`deadline_at < now()` et non archivé)
  - **Archivés (mois)** (`status = archived` ce mois)
- Mini-graphes (optionnels v1, peuvent rester placeholders) : `Évolution 12 mois` (bar), `Top types` (donut) via Recharts, recalculés selon `direction` + filtres.

## 4. Barre de filtres combinatoires

Ligne unique responsive :

- `Input` plein-texte (sujet, expéditeur, référence)
- `Select` Statuts / Urgences / Types (peuplé depuis `mail_types`) / Services (depuis `services_concernes`)
- `Select` SLA : *Tous / À l'heure / Bientôt dû (< 24 h) / En retard*
- Bloc « Filtrer par lot » : deux `Input type=date` (`Date début` / `Date fin`)

Toute modification déclenche un re-fetch debounced (300 ms). Pas de reload.

## 5. Tableau + verrouillage de l'édition

Colonnes : **N° · Date · Expéditeur/Destinataire · Objet · Type · Urgence · Statut · Actions**.

Actions par ligne : `Modifier` · `Archiver` · `Réassigner` (icônes + `Tooltip`).

**Règle de verrouillage** (`Modifier` désactivé si le courrier a été pris en charge) :

- `is_locked = (current_step > 1) OR EXISTS(workflow_transitions WHERE mail_id = m.id AND action != 'register')`
- Côté DB : vue/computed colonne ou simple `select` jointe ; côté UI bouton `disabled` + `Tooltip` « Verrouillé — courrier en traitement ».
- Synchro temps réel via Realtime Supabase sur `workflow_transitions` (channel `registre-locks`) : dès qu'une ligne est insérée, l'UI met à jour `is_locked`.
- Côté backend : politique RLS UPDATE sur `mails` complétée par un trigger `BEFORE UPDATE` qui rejette toute modification des champs « registre » (sender_*, subject, mail_type, priority, addressed_to…) si le courrier est verrouillé, sauf rôle `superadmin`.

## 6. Schéma DB — migrations

```sql
-- direction entrant/sortant
ALTER TABLE public.mails
  ADD COLUMN direction text NOT NULL DEFAULT 'entrant'
    CHECK (direction IN ('entrant','sortant')),
  ADD COLUMN target_service_id uuid,
  ADD COLUMN province_code text,
  ADD COLUMN locked_for_edit boolean NOT NULL DEFAULT false;

-- province sur le profil + override
ALTER TABLE public.profiles
  ADD COLUMN province_code text,
  ADD COLUMN habilitation_speciale boolean NOT NULL DEFAULT false;

-- référentiels dynamiques
CREATE TABLE public.mail_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  label text NOT NULL,
  direction text CHECK (direction IN ('entrant','sortant','both')) DEFAULT 'both',
  default_workflow_step int,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.services_concernes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  label text NOT NULL,
  default_handler_user_id uuid REFERENCES public.profiles(id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- helpers
CREATE FUNCTION public.get_user_province(_uid uuid) RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
  AS $$ SELECT province_code FROM profiles WHERE id=_uid $$;

CREATE FUNCTION public.has_habilitation_speciale(_uid uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
  AS $$ SELECT COALESCE(habilitation_speciale,false) FROM profiles WHERE id=_uid $$;

-- trigger verrouillage
CREATE FUNCTION public.lock_mail_on_pickup() RETURNS trigger ...
-- mis à jour quand workflow_transitions reçoit une action ≠ 'register'

-- RLS — restreindre SELECT sur mails par province
CREATE POLICY "Province scoped read on mails"
  ON public.mails FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'superadmin')
    OR has_role(auth.uid(),'admin')
    OR has_habilitation_speciale(auth.uid())
    OR province_code = get_user_province(auth.uid())
    OR registered_by = auth.uid()
  );

-- empêcher UPDATE registre si verrouillé
CREATE FUNCTION public.prevent_locked_mail_update() RETURNS trigger ...
-- bloque si OLD.locked_for_edit AND NOT superadmin
```

Politiques RLS pour `mail_types` et `services_concernes` : lecture publique authentifiée, écriture `admin`/`superadmin`.

## 7. Drawer d'enregistrement (Sheet)

Réutilise les champs existants de `MailEntry.tsx`, réorganisés en sections :

1. **Identité** (sender_* ou destinataire_* selon direction)
2. **Contenu** (subject, description, reception_date, deposit_time, attachment)
3. **Classification** (mail_type [select dynamique], priority, target_service [select dynamique])
4. **Routage workflow** :
   - Si un `default_workflow_step` existe pour le `mail_type` choisi → bandeau info « Sera routé automatiquement vers Étape 1 du circuit standard ».
   - Sinon → champ « Assigner à » (combobox utilisateurs filtrés par service).
5. Bouton « Enregistrer » → INSERT mail (avec `province_code` du profil), création `mail_assignments` étape 1, INSERT `notifications` pour le handler, INSERT `workflow_transitions` action `register`. Toast succès + fermeture drawer + refresh table.

## 8. Réassignation & archivage

- **Archiver** : RPC `advance_workflow_step(mail_id,'archive',uid)`.
- **Réassigner** : dialogue avec combobox utilisateurs ; INSERT `mail_assignments` étape courante (status `pending`) + notification, ancien `pending` passe en `reverted`.

## 9. Realtime

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.workflow_transitions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.mails;
```

Hook `useRegistreRealtime(setMails)` qui écoute `mails` et `workflow_transitions` filtrés sur les IDs visibles pour mettre à jour `locked_for_edit`, `current_step`, `status` en direct.

## 10. Plan d'exécution

| Lot | Contenu | Fichiers |
|---|---|---|
| L1 | Migration DB (colonnes, tables, RLS, triggers, realtime) | `supabase/migrations/<ts>_registre_unifie.sql` |
| L2 | Seed initial `mail_types` et `services_concernes` (valeurs actuelles `ordinaire/audience/...`) | migration |
| L3 | `RegistrePage.tsx` (layout, onglets, KPI, filtres, table, actions) | `src/pages/RegistrePage.tsx` |
| L4 | Drawer `MailRegistrationSheet` (réutilise champs de `MailEntry`) | `src/components/MailRegistrationSheet.tsx` |
| L5 | Dialogue Paramètres (Types / Services CRUD) | `src/components/RegistrySettingsDialog.tsx` |
| L6 | Hook `useRegistreData` + `useRegistreRealtime` | `src/hooks/useRegistreData.tsx` |
| L7 | Export CSV + PDF (jsPDF) | inline dans page |
| L8 | Sidebar/App router : suppression item Enregistrement, route `/registre`, redirections | `AppSidebar.tsx`, `App.tsx` |
| L9 | Page Admin : exposition du champ `province_code` et toggle `habilitation_speciale` sur profils | `AdminPage.tsx` |

## Points à confirmer avant exécution

1. **Liste exacte des provinces** à mettre dans le `Select` du profil (les 26 provinces RDC, ou liste réduite Kinshasa/Lubumbashi/Goma + autres) ?
2. **Conservation de `/mail-entry`** comme route legacy (redirect vers `/registre`) ou suppression dure ?
3. Pour les types existants stockés en `text` (`ordinaire`, `audience`, etc.), on **migre** vers `mail_types.code` (FK string) ou on garde `mail_type text` + lookup logique côté UI ?
4. Le bouton **Réassigner** est-il limité à l'étape courante (réassignation latérale) ou peut-il aussi changer d'étape ?

Une fois ces points clarifiés, je passe en mode build et j'enchaîne les lots L1 → L9.
