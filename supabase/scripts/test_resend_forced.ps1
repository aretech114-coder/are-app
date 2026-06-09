# Test forcé Resend — Edge Function send-notification-email
# Usage (PowerShell) :
#   $env:SUPABASE_URL = "https://VOTRE_PROJECT.supabase.co"
#   $env:SUPABASE_JWT = "eyJ..."   # JWT utilisateur connecté OU service_role key
#   .\supabase\scripts\test_resend_forced.ps1 -To "votre@email.com"

param(
  [Parameter(Mandatory = $true)]
  [string]$To,

  [string]$Name = "Test ARE App",

  [string]$Subject = "Test forcé Resend — ARE App",

  [string]$SupabaseUrl = $env:SUPABASE_URL,

  [string]$BearerToken = $env:SUPABASE_JWT
)

if (-not $SupabaseUrl) {
  Write-Error "Définissez SUPABASE_URL ou passez -SupabaseUrl"
  exit 1
}

if (-not $BearerToken) {
  Write-Error @"
Définissez SUPABASE_JWT :
  - JWT utilisateur : DevTools → Application → localStorage → clé sb-*-auth-token → access_token
  - OU service role : Supabase Dashboard → Settings → API → service_role (secret)
"@
  exit 1
}

$body = @{
  recipient_email = $To
  recipient_name  = $Name
  subject         = $Subject
  body_html       = @"
<!DOCTYPE html>
<html lang="fr">
<body style="font-family: Arial, sans-serif; padding: 24px;">
  <h2>Test forcé Resend</h2>
  <p>Bonjour <strong>$Name</strong>,</p>
  <p>Si vous recevez cet e-mail, <strong>Resend + noreply@are-app.cloud</strong> fonctionnent correctement.</p>
  <p><small>Envoyé le $(Get-Date -Format "yyyy-MM-dd HH:mm:ss") UTC</small></p>
</body>
</html>
"@
  notification_type = "transition"
} | ConvertTo-Json -Depth 5

$url = "$SupabaseUrl/functions/v1/send-notification-email"

Write-Host "POST $url"
Write-Host "Destinataire: $To"
Write-Host ""

try {
  $response = Invoke-RestMethod -Method Post -Uri $url `
    -Headers @{
      Authorization = "Bearer $BearerToken"
      "Content-Type" = "application/json"
    } `
    -Body $body

  Write-Host "SUCCÈS:" -ForegroundColor Green
  $response | ConvertTo-Json
  Write-Host ""
  Write-Host "Attendu: provider = resend"
  Write-Host "Vérifiez la boîte $To (et les spams)."
  Write-Host "Resend Dashboard → Emails → Logs"
  Write-Host "Supabase → Edge Functions → send-notification-email → Logs"
} catch {
  Write-Host "ÉCHEC:" -ForegroundColor Red
  if ($_.Exception.Response) {
    $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
    Write-Host $reader.ReadToEnd()
  } else {
    Write-Host $_.Exception.Message
  }
  exit 1
}
