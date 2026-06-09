# Test forcé Resend (prod)

Domaine vérifié : **are-app.cloud**  
Expéditeur : **`ARE App <noreply@are-app.cloud>`**

## 0. Prérequis (checklist)

- [ ] Resend → Domains → **are-app.cloud** = **Verified**
- [ ] Supabase → Edge Functions → Secrets :
  - `RESEND_API_KEY` = `re_...`
  - `RESEND_FROM` = `ARE App <noreply@are-app.cloud>`
- [ ] Edge Function `send-notification-email` déployée (date récente)

---

## Méthode A — Console navigateur (la plus simple)

1. Connectez-vous à l’app prod : https://are-app.cloud
2. Ouvrez **F12** → **Console**
3. Collez (remplacez l’e-mail) :

```javascript
(async () => {
  const key = Object.keys(localStorage).find((k) => k.includes("auth-token"));
  const token = JSON.parse(localStorage.getItem(key))?.access_token;
  const url = "https://axgpnkxsiudiixalbuz.supabase.co/functions/v1/send-notification-email";

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      recipient_email: "VOTRE_EMAIL@example.com",
      recipient_name: "Test ARE",
      subject: "Test forcé Resend — ARE App",
      body_html: "<h2>OK</h2><p>Resend + noreply@are-app.cloud fonctionne.</p>",
      notification_type: "transition",
    }),
  });
  console.log(await res.json());
})();
```

**Succès attendu :** `{ success: true, provider: "resend", recipient: "..." }`

---

## Méthode B — Script PowerShell

```powershell
cd "C:\chemin\vers\are-app"

$env:SUPABASE_URL = "https://axgpnkxsiudiixalbuz.supabase.co"   # prod
$env:SUPABASE_JWT = "eyJ..."   # JWT session ou service_role

.\supabase\scripts\test_resend_forced.ps1 -To "aretech114@gmail.com"
```

### Obtenir le JWT utilisateur

1. F12 → **Application** → **Local Storage** → `https://are-app.cloud`
2. Clé du type `sb-...-auth-token` → JSON → `access_token`

### Obtenir la service role (alternative)

Supabase Dashboard → **Project Settings** → **API** → `service_role` (secret, ne pas exposer publiquement).

---

## Méthode C — curl

```bash
curl -X POST "https://axgpnkxsiudiixalbuz.supabase.co/functions/v1/send-notification-email" \
  -H "Authorization: Bearer VOTRE_JWT_OU_SERVICE_ROLE" \
  -H "Content-Type: application/json" \
  -d '{
    "recipient_email": "votre@email.com",
    "recipient_name": "Test",
    "subject": "Test forcé Resend",
    "body_html": "<p>Test ARE App</p>",
    "notification_type": "transition"
  }'
```

---

## Méthode D — Test métier (workflow)

1. **Workflow** (admin) : notifications **activées** pour une étape (ex. 4).
2. Profil destinataire avec e-mail valide dans `profiles.email`.
3. Avancer un courrier test avec assignés.
4. Vérifier les logs :

| Où | Quoi |
|----|------|
| Supabase → Edge Functions → `send-notification-email` → **Logs** | `Email sent via resend to ...` |
| Resend → **Emails** | Statut **Delivered** |
| Boîte destinataire | E-mail avec template configuré |

---

## Erreurs fréquentes

| Réponse / symptôme | Cause | Action |
|--------------------|-------|--------|
| `401 Unauthorized` | JWT expiré ou invalide | Reconnectez-vous ou regénérez le token |
| `Email not configured` | Secrets manquants | Vérifier `RESEND_API_KEY` + `RESEND_FROM` |
| `Resend API error (403)` domain | From ≠ domaine vérifié | `RESEND_FROM` doit être `@are-app.cloud` |
| `Resend API error (422)` | Format From incorrect | `ARE App <noreply@are-app.cloud>` |
| Succès API mais pas de mail | Spam / délai | Vérifier spam ; Resend → Logs |
| `provider: smtp` au lieu de `resend` | `RESEND_API_KEY` absent | Reconfigurer secrets + redeploy |

---

## Validation finale

- [ ] Réponse JSON `success: true`, `provider: "resend"`
- [ ] Log Supabase Edge Function OK
- [ ] Log Resend **Delivered**
- [ ] E-mail reçu (≤ 2 min)
