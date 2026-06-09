import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, Mail, Send, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

type SendMode = "direct" | "workflow";

type TestResult = {
  success: boolean;
  provider?: string;
  recipient?: string;
  providerMessageId?: string | null;
  error?: string;
};

type ProfileOption = {
  id: string;
  full_name: string | null;
  email: string | null;
};

export function EmailNotificationTester() {
  const { user } = useAuth();
  const [sendMode, setSendMode] = useState<SendMode>("direct");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [recipientName, setRecipientName] = useState("");
  const [subject, setSubject] = useState("Test notification — ARE App");
  const [bodyHtml, setBodyHtml] = useState(
    "<h2>Test de délivrance</h2><p>Si vous recevez cet e-mail, le canal de notifications fonctionne correctement.</p>"
  );
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState<TestResult | null>(null);

  useEffect(() => {
    if (sendMode !== "workflow") return;
    setProfilesLoading(true);
    supabase
      .from("profiles")
      .select("id, full_name, email")
      .order("full_name")
      .then(({ data, error }) => {
        if (error) toast.error("Impossible de charger les utilisateurs");
        setProfiles(data ?? []);
        setProfilesLoading(false);
      });
  }, [sendMode]);

  const selectedProfile = profiles.find((p) => p.id === selectedUserId);

  const handleSendTest = async (e: React.FormEvent) => {
    e.preventDefault();
    setLastResult(null);

    if (sendMode === "direct") {
      if (!recipientEmail.trim()) {
        toast.error("Saisissez l'e-mail destinataire");
        return;
      }
    } else if (!selectedUserId) {
      toast.error("Sélectionnez un utilisateur");
      return;
    } else if (!selectedProfile?.email?.trim()) {
      toast.error("Cet utilisateur n'a pas d'e-mail dans profiles.email — corrigez le profil avant le test workflow");
      return;
    }

    setSending(true);

    try {
      const body: Record<string, string> = {
        recipient_name: recipientName.trim() || selectedProfile?.full_name?.trim() || "Testeur ARE",
        subject: subject.trim() || "Test notification — ARE App",
        body_html: bodyHtml.trim(),
        notification_type: "test",
      };

      if (sendMode === "workflow") {
        body.recipient_user_id = selectedUserId;
      } else {
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
      toast.success(`E-mail envoyé à ${res.data?.recipient}`);
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
          Vérifiez Resend/SMTP. Choisissez le mode de test — l&apos;ID utilisateur et l&apos;e-mail direct ne doivent
          pas être mélangés.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-sm">
            Si tous vos tests arrivaient sur <strong>{user?.email ?? "votre e-mail super admin"}</strong>, c&apos;est
            que l&apos;ID super admin était encore envoyé en même temps que l&apos;e-mail saisi. Utilisez un seul mode
            ci-dessous.
          </AlertDescription>
        </Alert>

        <form onSubmit={handleSendTest} className="space-y-4">
          <RadioGroup
            value={sendMode}
            onValueChange={(v) => {
              setSendMode(v as SendMode);
              setLastResult(null);
            }}
            className="grid gap-3 md:grid-cols-2"
          >
            <div className="flex items-start gap-3 rounded-lg border p-3">
              <RadioGroupItem value="direct" id="mode-direct" className="mt-1" />
              <Label htmlFor="mode-direct" className="cursor-pointer space-y-1">
                <span className="font-medium">E-mail direct</span>
                <p className="text-xs text-muted-foreground font-normal">
                  Tester n&apos;importe quelle adresse (Gmail, pro, etc.)
                </p>
              </Label>
            </div>
            <div className="flex items-start gap-3 rounded-lg border p-3">
              <RadioGroupItem value="workflow" id="mode-workflow" className="mt-1" />
              <Label htmlFor="mode-workflow" className="cursor-pointer space-y-1">
                <span className="font-medium">Comme le workflow</span>
                <p className="text-xs text-muted-foreground font-normal">
                  Résolution via <code>profiles.email</code> (ID utilisateur)
                </p>
              </Label>
            </div>
          </RadioGroup>

          {sendMode === "direct" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="test-email">E-mail destinataire</Label>
                <Input
                  id="test-email"
                  type="email"
                  placeholder="agent@exemple.com"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  disabled={sending}
                  required
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Utilisateur (profil)</Label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId} disabled={sending || profilesLoading}>
                <SelectTrigger>
                  <SelectValue placeholder={profilesLoading ? "Chargement..." : "Choisir un utilisateur"} />
                </SelectTrigger>
                <SelectContent>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {(p.full_name || "Sans nom") + (p.email ? ` — ${p.email}` : " — (e-mail vide)")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedProfile && (
                <p className="text-xs text-muted-foreground">
                  Envoi workflow vers :{" "}
                  <strong>{selectedProfile.email?.trim() || "— aucun e-mail en base —"}</strong>
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            <div className="space-y-2">
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
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={sending}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              <span className="ml-2">{sending ? "Envoi..." : "Envoyer le test"}</span>
            </Button>
            {lastResult && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {lastResult.success ? (
                  <>
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-200">
                      Succès
                    </Badge>
                    {lastResult.recipient && (
                      <span className="text-muted-foreground">
                        Envoyé à <strong>{lastResult.recipient}</strong>
                      </span>
                    )}
                    {lastResult.provider && (
                      <span className="text-muted-foreground">via {lastResult.provider}</span>
                    )}
                    {lastResult.providerMessageId && (
                      <span className="text-muted-foreground font-mono text-xs">
                        ID Resend : {lastResult.providerMessageId}
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
          Après envoi, vérifiez Resend → Emails : l&apos;adresse « To » doit correspondre au destinataire choisi. Si
          Resend affiche Delivered mais pas de mail en boîte (hors Gmail), le filtre est côté messagerie du destinataire.
        </p>
      </CardContent>
    </Card>
  );
}
