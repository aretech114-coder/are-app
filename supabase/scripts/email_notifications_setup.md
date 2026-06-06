# Notifications e-mail workflow — configuration prod

## Deux canaux distincts

| Canal | Configuration | Usage |
|-------|---------------|--------|
| **Supabase Auth SMTP** | Dashboard → Authentication → SMTP | Reset mot de passe, invitations Auth |
| **Edge Function `send-notification-email`** | Secrets Supabase (ci-dessous) | Avancement workflow, rappels SLA |

## Option A — Resend (recommandé, délivrabilité)

1. Créer un compte [Resend](https://resend.com) et vérifier votre domaine (SPF + DKIM dans DNS).
2. Secrets Supabase (Project Settings → Edge Functions → Secrets) :

```bash
supabase secrets set RESEND_API_KEY=re_xxxxxxxx
supabase secrets set RESEND_FROM="ARE App <notifications@votre-domaine.org>"
```

3. Redéployer la fonction (push sur `develop` ou manuel) :

```bash
supabase functions deploy send-notification-email --no-verify-jwt
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
- À chaque avancement : e-mail **individuel** à chaque assigné (contributors + viewers + responsable par défaut).
- Rappels SLA (`sla-checker`) : autorisés via **service role** (cron).

## Tests

### 1. Test direct Edge Function (JWT utilisateur connecté)

```bash
curl -X POST "https://VOTRE_PROJECT.supabase.co/functions/v1/send-notification-email" \
  -H "Authorization: Bearer JWT_UTILISATEUR" \
  -H "Content-Type: application/json" \
  -d '{"recipient_email":"test@example.com","recipient_name":"Test","subject":"Test ARE","body_html":"<p>OK</p>"}'
```

Réponse attendue : `{"success":true,"provider":"resend"}` ou `"smtp"`.

### 2. Test workflow

1. Profil destinataire avec e-mail valide dans `profiles.email`.
2. Toggle mail activé pour l'étape cible.
3. Avancer un courrier test → vérifier logs Edge Function + boîte mail.

### 3. Test SLA

```bash
curl -X POST "https://VOTRE_PROJECT.supabase.co/functions/v1/sla-checker" \
  -H "Authorization: Bearer SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json"
```

### 4. Délivrabilité

- [mail-tester.com](https://www.mail-tester.com) — objectif ≥ 8/10.
- Vérifier SPF, DKIM, DMARC sur le domaine d'envoi.

## Cron SLA (optionnel)

Planifier un appel quotidien à `sla-checker` avec la **service role key** (Supabase Cron, GitHub Action, ou cron serveur).
