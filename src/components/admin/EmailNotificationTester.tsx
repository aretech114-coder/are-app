import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Mail, Send } from "lucide-react";
import { toast } from "sonner";

type TestResult = {
  success: boolean;
  provider?: string;
  recipient?: string;
  providerMessageId?: string | null;
  error?: string;
};

export function EmailNotificationTester() {
  const { user } = useAuth();
  const [recipientEmail, setRecipientEmail] = useState(user?.email ?? "");
  const [recipientUserId, setRecipientUserId] = useState(user?.id ?? "");
  const [recipientName, setRecipientName] = useState("");
  const [subject, setSubject] = useState("Test notification — ARE App");
  const [bodyHtml, setBodyHtml] = useState(
    "<h2>Test de délivrance</h2><p>Si vous recevez cet e-mail, le canal de notifications fonctionne correctement.</p>"
  );
  const [sending, setSending] = useState(false);
  const [checkingProfile, setCheckingProfile] = useState(false);
  const [profileCheck, setProfileCheck] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<TestResult | null>(null);

  const handleCheckProfile = async () => {
    if (!recipientUserId.trim()) {
      toast.error("ID utilisateur requis pour la vérification profil");
      return;
    }
    setCheckingProfile(true);
    setProfileCheck(null);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("id", recipientUserId.trim())
      .maybeSingle();
    setCheckingProfile(false);
    if (error) {
      setProfileCheck(`Erreur lecture profil : ${error.message}`);
      return;
    }
    if (!data) {
      setProfileCheck("Profil introuvable pour cet ID.");
      return;
    }
    setProfileCheck(
      `Profil : ${data.full_name || "—"} — e-mail en base : ${data.email || "(vide — aucun mail workflow ne partira)"}`
    );
    if (data.email) setRecipientEmail(data.email);
  };

  const handleSendTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipientEmail.trim() && !recipientUserId.trim()) {
      toast.error("E-mail ou ID utilisateur requis");
      return;
    }

    setSending(true);
    setLastResult(null);

    try {
      const body: Record<string, string> = {
        recipient_name: recipientName.trim() || "Testeur ARE",
        subject: subject.trim() || "Test notification — ARE App",
        body_html: bodyHtml.trim(),
        notification_type: "test",
      };
      if (recipientUserId.trim()) {
        body.recipient_user_id = recipientUserId.trim();
      }
      if (recipientEmail.trim()) {
        body.recipient_email = recipientEmail.trim();
      }

      const res = await supabase.functions.invoke("send-notification-email", { body });

      if (res.error) {
        const message = res.error.message || "Erreur lors de l'envoi";
        setLastResult({ success: false, error: message });
        toast.error(message);
        return;
      }

      if (res.data?.error) {
        setLastResult({ success: false, error: res.data.error });
        toast.error(res.data.error);
        return;
      }

      const result: TestResult = {
        success: true,
        provider: res.data?.provider,
        recipient: res.data?.recipient,
        providerMessageId: res.data?.provider_message_id,
      };
      setLastResult(result);
      toast.success(`E-mail envoyé via ${res.data?.provider || "provider inconnu"}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erreur inattendue";
      setLastResult({ success: false, error: message });
      toast.error(message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Mail className="h-5 w-5" />
          Testeur de notifications e-mail
        </CardTitle>
        <CardDescription>
          Envoyez un e-mail de test via la Edge Function <code className="text-xs">send-notification-email</code>{" "}
          (Resend ou SMTP selon la configuration Supabase).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSendTest} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="test-user-id">ID utilisateur (comme en workflow)</Label>
            <div className="flex gap-2">
              <Input
                id="test-user-id"
                placeholder="uuid du profil"
                value={recipientUserId}
                onChange={(e) => setRecipientUserId(e.target.value)}
                disabled={sending}
                className="font-mono text-xs"
              />
              <Button type="button" variant="outline" onClick={handleCheckProfile} disabled={checkingProfile}>
                {checkingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : "Vérifier profil"}
              </Button>
            </div>
            {profileCheck && (
              <p className="text-xs text-muted-foreground">{profileCheck}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="test-email">Destinataire (e-mail direct)</Label>
            <Input
              id="test-email"
              type="email"
              placeholder="vous@exemple.com"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              disabled={sending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="test-name">Nom affiché (optionnel)</Label>
            <Input
              id="test-name"
              placeholder="Jean Dupont"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              disabled={sending}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="test-subject">Objet</Label>
            <Input
              id="test-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={sending}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="test-body">Corps HTML</Label>
            <Textarea
              id="test-body"
              rows={5}
              value={bodyHtml}
              onChange={(e) => setBodyHtml(e.target.value)}
              disabled={sending}
              className="font-mono text-xs"
            />
          </div>
          <div className="md:col-span-2 flex items-center gap-3">
            <Button type="submit" disabled={sending}>
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              <span className="ml-2">{sending ? "Envoi..." : "Envoyer le test"}</span>
            </Button>
            {lastResult && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {lastResult.success ? (
                  <>
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-200">
                      Succès
                    </Badge>
                    {lastResult.provider && (
                      <span className="text-muted-foreground">
                        Provider : <strong>{lastResult.provider}</strong>
                      </span>
                    )}
                    {lastResult.recipient && (
                      <span className="text-muted-foreground">→ {lastResult.recipient}</span>
                    )}
                    {lastResult.providerMessageId && (
                      <span className="text-muted-foreground font-mono text-xs">
                        Resend ID : {lastResult.providerMessageId}
                      </span>
                    )}
                  </>
                ) : (
                  <Badge variant="destructive">Échec : {lastResult.error}</Badge>
                )}
              </div>
            )}
          </div>
        </form>
        <p className="text-xs text-muted-foreground">
          Mode workflow : testez avec l&apos;ID utilisateur d&apos;un agent (résolution e-mail côté serveur via{" "}
          <code className="text-xs">profiles.email</code>). Comparez l&apos;adresse affichée dans Resend → Emails
          avec celle du profil. Si Resend indique « Delivered » mais rien en boîte, le filtre est probablement côté
          serveur mail du destinataire (domaine gouvernemental, etc.).
        </p>
      </CardContent>
    </Card>
  );
}
