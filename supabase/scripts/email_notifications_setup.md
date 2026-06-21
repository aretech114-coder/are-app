# Notifications e-mail workflow — configuration prod

## Deux canaux distincts

| Canal | Configuration | Usage |
|-------|---------------|--------|
| **Supabase Auth SMTP** | Dashboard → Authentication → SMTP | Reset mot de passe, invitations Auth |
| **Edge Functions** | Secrets Supabase (ci-dessous) | Workflow (`dispatch-workflow-notifications`), rappels SLA (`sla-checker`) |

## Architecture workflow (v2)

Tous les envois e-mail métier passent par **`dispatch-workflow-notifications`** :

- Enregistrement registre → étape 2 (`register`)
- Avancement workflow (`transition` / `rejection`)
- Pré-assignation étape 4 (`pre_assignment`)
- Réassignation registre
- Tests admin (`dry_run` / `force_send`)

Chaque tentative est journalisée dans **`notification_deliveries`** (migration prod étape **Y**).

## Option A — Resend (recommandé, délivrabilité)

1. Créer un compte [Resend](https://resend.com) et vérifier votre domaine (SPF + DKIM dans DNS).
2. Secrets Supabase (Project Settings → Edge Functions → Secrets) :

```bash
supabase secrets set RESEND_API_KEY=re_xxxxxxxx
supabase secrets set RESEND_FROM="ARE App <notifications@votre-domaine.org>"
```

3. Redéployer les fonctions (push sur `develop` ou manuel) :

```bash
supabase functions deploy send-notification-email --no-verify-jwt
supabase functions deploy dispatch-workflow-notifications --no-verify-jwt
```

## Option B — SMTP classique (fallback)

Si `RESEND_API_KEY` est absent, la fonction utilise SMTP :

```bash
supabase secrets set SMTP_HOST=smtp.example.com
supabase secrets set SMTP_PORT=465
supabase secrets set SMTP_USER=...
supabase secrets set SMTP_PASS=...
supabase secrets set SMTP_FROM="ARE App <notifications@votre-domaine.org>"
```

## Comportement applicatif

- Toggle **notify_enabled** par étape : page Workflow (admin).
- **Éditeur e-mail** : icône crayon à côté du toggle → sujet + corps HTML (traitement / lecture seule).
- Shortcodes : `{{recipient_name}}`, `{{step_name}}`, `{{mail_subject}}`, `{{reference_number}}`, `{{access_mode_label}}`, `{{assignees_list}}`, `{{assignees_count}}`, `{{inbox_url}}`.
- Destinataires résolus côté Edge : assignations étape (`contributor` / `viewer` / `custodian`), `assigned_agent_id`, `fallback_user_id`, puis **`default_user_id`** de l'étape si aucun assigné.
- Rappels SLA (`sla-checker`) : autorisés via **service role** (cron).

## Panneau admin

Page **Intégrations** (`/integrations`) — visible pour superadmin et admin avec permission `manage_workflow` :

- **Santé** : ping canal, profils sans e-mail, volume 7 jours par étape, 20 derniers envois.
- **Simulateur** : dry run destinataires + envoi test `force_send`.
- **Test canal** (superadmin) : `EmailNotificationTester` pour Resend/SMTP isolé.

## Migration prod étape Y

Appliquer `supabase/migrations/20260613100000_notification_deliveries.sql` via SQL Editor (voir `production_migrations_guide.md`).

## Tests

### 0. Test forcé Resend (prod)

Guide détaillé : [`test_resend_forced.md`](test_resend_forced.md)  
Script PowerShell : [`test_resend_forced.ps1`](test_resend_forced.ps1)

Expéditeur prod attendu :

```bash
supabase secrets set RESEND_FROM="ARE App <noreply@are-app.cloud>"
```

### 1. Test direct Edge Function (JWT utilisateur connecté)

```bash
curl -X POST "https://VOTRE_PROJECT.supabase.co/functions/v1/send-notification-email" \
  -H "Authorization: Bearer JWT_UTILISATEUR" \
  -H "Content-Type: application/json" \
  -d '{"recipient_email":"test@example.com","recipient_name":"Test","subject":"Test ARE","body_html":"<p>OK</p>"}'
```

Réponse attendue : `{"success":true,"provider":"resend"}` ou `"smtp"`.

### 2. Test workflow via simulateur

1. Intégrations → Notifications workflow → rechercher un courrier test.
2. **Analyser (dry run)** : vérifier la liste exacte des destinataires (nom, e-mail, mode, raison skip).
3. **Envoyer test workflow** : e-mail reçu même si toggle OFF (`force_send`).

### 3. Checklist parcours métier

| Scénario | Attendu |
|----------|---------|
| Enregistrement sans PJ | Bouton désactivé + alerte en tête du formulaire registre |
| Enregistrement courrier → étape 2 | E-mail DG + toast succès si envoyé + ligne `notification_deliveries` type `register` |
| DG valide étape 2 → étape 4 | E-mails assignés contributors + viewers + lignes audit |
| Dernier conseiller soumet étape 4 | E-mail responsable étape d'arrivée (5 ou 6) avec `assigned_to` propagé |
| Avancement étapes 5→6→7→8→9 | E-mail à chaque étape d'arrivée |
| Toggle étape OFF | `skipped` / `notify_disabled`, pas d'envoi |
| Profil sans e-mail | `skipped/no_email` + toast warning + alerte pré-vol à l'enregistrement |
| Simulateur dry_run | Liste exacte des destinataires avant envoi réel |
| Admin test force_send | E-mail reçu même si toggle OFF (test uniquement) |
| Réassignation registre | E-mail nouveau assigné + journal `reassign` |

**Post-fix (migration Z + Edge Function)** : redéployer `dispatch-workflow-notifications`, appliquer migration **Z**, puis rejouer la checklist sur un courrier test de bout en bout.

### 4. Profils sans e-mail (préventif)

```sql
SELECT p.full_name, p.email, ur.role
FROM profiles p
JOIN user_roles ur ON ur.user_id = p.id
WHERE (p.email IS NULL OR btrim(p.email) = '')
  AND ur.role IN ('dg', 'dircab', 'dircaba', 'conseiller', 'conseiller_juridique', 'secretariat');
```

### 5. Test SLA

```bash
curl -X POST "https://VOTRE_PROJECT.supabase.co/functions/v1/sla-checker" \
  -H "Authorization: Bearer SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json"
```

### 6. Délivrabilité

- [mail-tester.com](https://www.mail-tester.com) — objectif ≥ 8/10.
- Vérifier SPF, DKIM, DMARC sur le domaine d'envoi.

## Cron SLA (optionnel)

Planifier un appel quotidien à `sla-checker` avec la **service role key** (Supabase Cron, GitHub Action, ou cron serveur).
