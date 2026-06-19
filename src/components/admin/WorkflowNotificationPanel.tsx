import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useActiveWorkflowSteps } from "@/hooks/useWorkflowSteps";
import { dispatchWorkflowNotifications, type DispatchWorkflowResult } from "@/lib/workflow-notifications";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Mail,
  RefreshCw,
  Search,
  Send,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { getRoleLabel } from "@/lib/labels";

const WORKFLOW_ROLES = [
  "dg",
  "dircab",
  "dircaba",
  "conseiller",
  "conseiller_juridique",
  "secretariat",
];

type DeliveryRow = {
  id: string;
  created_at: string;
  mail_id: string | null;
  step_number: number | null;
  notification_type: string;
  recipient_email: string | null;
  status: string;
  skip_reason: string | null;
  error_message: string | null;
  provider: string | null;
  trigger_source: string;
};

type StepHealthRow = {
  step_number: number;
  step_name: string;
  notify_enabled: boolean;
  sent_7d: number;
};

type MissingEmailProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
};

function statusBadge(status: string) {
  if (status === "sent") {
    return (
      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/20">
        <CheckCircle2 className="h-3 w-3 mr-1" />
        Envoyé
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">
        <XCircle className="h-3 w-3 mr-1" />
        Échec
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/20">
      Ignoré
    </Badge>
  );
}

export function WorkflowNotificationPanel() {
  const { user } = useAuth();
  const { data: activeSteps = [] } = useActiveWorkflowSteps();

  const [healthLoading, setHealthLoading] = useState(true);
  const [channelOk, setChannelOk] = useState<boolean | null>(null);
  const [channelProvider, setChannelProvider] = useState<string | null>(null);
  const [channelTesting, setChannelTesting] = useState(false);
  const [missingEmails, setMissingEmails] = useState<MissingEmailProfile[]>([]);
  const [stepHealth, setStepHealth] = useState<StepHealthRow[]>([]);
  const [recentDeliveries, setRecentDeliveries] = useState<DeliveryRow[]>([]);

  const [mailQuery, setMailQuery] = useState("");
  const [mailResults, setMailResults] = useState<{ id: string; reference_number: string; subject: string }[]>([]);
  const [selectedMailId, setSelectedMailId] = useState("");
  const [simStep, setSimStep] = useState<number>(2);
  const [simType, setSimType] = useState<"register" | "transition" | "pre_assignment">("transition");
  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState<DispatchWorkflowResult | null>(null);

  const selectedMail = useMemo(
    () => mailResults.find((m) => m.id === selectedMailId),
    [mailResults, selectedMailId]
  );

  const loadHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("role", WORKFLOW_ROLES as any);

      const userIds = [...new Set((roleRows || []).map((r) => r.user_id))];
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", userIds);

        const roleByUser = new Map((roleRows || []).map((r) => [r.user_id, r.role]));
        const missing = (profiles || [])
          .filter((p) => !p.email?.trim())
          .map((p) => ({
            id: p.id,
            full_name: p.full_name,
            email: p.email,
            role: roleByUser.get(p.id) || "—",
          }));
        setMissingEmails(missing);
      } else {
        setMissingEmails([]);
      }

      const since = new Date();
      since.setDate(since.getDate() - 7);

      const { data: responsibles } = await supabase
        .from("workflow_step_responsibles")
        .select("step_number, notify_enabled");

      const { data: deliveries7d } = await supabase
        .from("notification_deliveries")
        .select("step_number, status")
        .gte("created_at", since.toISOString());

      const sentByStep = new Map<number, number>();
      for (const d of deliveries7d || []) {
        if (d.status === "sent" && d.step_number != null) {
          sentByStep.set(d.step_number, (sentByStep.get(d.step_number) || 0) + 1);
        }
      }

      const respByStep = new Map(
        (responsibles || []).map((r: { step_number: number; notify_enabled: boolean }) => [
          r.step_number,
          r.notify_enabled !== false,
        ])
      );

      setStepHealth(
        activeSteps.map((s) => ({
          step_number: s.step_order,
          step_name: s.name,
          notify_enabled: respByStep.get(s.step_order) ?? true,
          sent_7d: sentByStep.get(s.step_order) || 0,
        }))
      );

      const { data: recent } = await supabase
        .from("notification_deliveries")
        .select(
          "id, created_at, mail_id, step_number, notification_type, recipient_email, status, skip_reason, error_message, provider, trigger_source"
        )
        .order("created_at", { ascending: false })
        .limit(20);

      setRecentDeliveries((recent as DeliveryRow[]) || []);
    } catch (err) {
      console.error("WorkflowNotificationPanel health:", err);
      toast.error("Impossible de charger le diagnostic notifications");
    } finally {
      setHealthLoading(false);
    }
  }, [activeSteps]);

  const testChannel = async () => {
    if (!user?.email) {
      toast.error("Votre profil n'a pas d'e-mail");
      return;
    }
    setChannelTesting(true);
    try {
      const ping = await supabase.functions.invoke("send-notification-email", {
        body: {
          recipient_email: user.email,
          recipient_name: "Test canal ARE",
          subject: "Ping canal notifications — ARE App",
          body_html: "<p>Test de connectivité Resend/SMTP.</p>",
          notification_type: "test",
        },
      });
      const ok = !ping.error && !ping.data?.error;
      setChannelOk(ok);
      setChannelProvider(ping.data?.provider ?? null);
      if (ok) toast.success(`Canal OK (${ping.data?.provider})`);
      else toast.error(ping.data?.error || ping.error?.message || "Échec du test canal");
    } finally {
      setChannelTesting(false);
    }
  };

  useEffect(() => {
    loadHealth();
  }, [loadHealth]);

  useEffect(() => {
    if (activeSteps.length > 0 && !activeSteps.some((s) => s.step_order === simStep)) {
      setSimStep(activeSteps[0].step_order);
    }
  }, [activeSteps, simStep]);

  const searchMails = async () => {
    const q = mailQuery.trim();
    if (q.length < 2) {
      toast.error("Saisissez au moins 2 caractères");
      return;
    }
    const { data, error } = await supabase
      .from("mails")
      .select("id, reference_number, subject")
      .or(`reference_number.ilike.%${q}%,subject.ilike.%${q}%`)
      .order("created_at", { ascending: false })
      .limit(15);

    if (error) {
      toast.error(error.message);
      return;
    }
    setMailResults(data || []);
    if (data?.length === 1) setSelectedMailId(data[0].id);
  };

  const runSimulation = async (forceSend: boolean) => {
    if (!selectedMailId) {
      toast.error("Sélectionnez un courrier");
      return;
    }
    setSimulating(true);
    setSimResult(null);
    try {
      const result = await dispatchWorkflowNotifications({
        mail_id: selectedMailId,
        step_number: simStep,
        notification_type: simType,
        trigger_source: forceSend ? "admin_test" : "admin_test",
        dry_run: !forceSend,
        force_send: forceSend,
      });
      setSimResult(result);
      if (result.error) {
        toast.error(result.error);
      } else if (forceSend) {
        toast.success(`${result.sent} e-mail(s) envoyé(s), ${result.failed} échec(s), ${result.skipped} ignoré(s)`);
        loadHealth();
      } else {
        toast.success(`${result.recipients.length} destinataire(s) analysé(s)`);
      }
    } finally {
      setSimulating(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Activity className="h-5 w-5" />
              Santé notifications workflow
            </CardTitle>
            <CardDescription>
              Canal e-mail, profils incomplets, activité par étape et journal des 20 derniers envois.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={loadHealth} disabled={healthLoading}>
            {healthLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-lg border p-4 space-y-2">
              <p className="text-xs text-muted-foreground">Canal Resend/SMTP</p>
              {channelOk === null ? (
                <p className="text-sm text-muted-foreground">Non testé</p>
              ) : channelOk ? (
                <p className="font-medium text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4" />
                  Opérationnel {channelProvider ? `(${channelProvider})` : ""}
                </p>
              ) : (
                <p className="font-medium text-destructive flex items-center gap-1">
                  <XCircle className="h-4 w-4" />
                  Indisponible
                </p>
              )}
              <Button variant="outline" size="sm" onClick={testChannel} disabled={channelTesting}>
                {channelTesting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                Tester le canal
              </Button>
            </div>
            <div className="rounded-lg border p-4 space-y-1">
              <p className="text-xs text-muted-foreground">Profils workflow sans e-mail</p>
              <p className={`text-2xl font-semibold ${missingEmails.length > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                {missingEmails.length}
              </p>
            </div>
            <div className="rounded-lg border p-4 space-y-1">
              <p className="text-xs text-muted-foreground">Envois réussis (7 jours)</p>
              <p className="text-2xl font-semibold">
                {stepHealth.reduce((acc, s) => acc + s.sent_7d, 0)}
              </p>
            </div>
          </div>

          {missingEmails.length > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-sm">
                {missingEmails.length} utilisateur(s) workflow n&apos;ont pas d&apos;e-mail dans{" "}
                <code>profiles.email</code> — les notifications échoueront pour eux.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Étapes — toggle et volume 7 jours</h4>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Étape</TableHead>
                    <TableHead>Nom</TableHead>
                    <TableHead>E-mail actif</TableHead>
                    <TableHead className="text-right">Envoyés (7j)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stepHealth.map((row) => (
                    <TableRow key={row.step_number}>
                      <TableCell>{row.step_number}</TableCell>
                      <TableCell>{row.step_name}</TableCell>
                      <TableCell>
                        {row.notify_enabled ? (
                          <Badge variant="outline" className="text-emerald-700">ON</Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">OFF</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{row.sent_7d}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {missingEmails.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Profils sans e-mail</h4>
              <div className="rounded-md border overflow-x-auto max-h-40">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nom</TableHead>
                      <TableHead>Rôle</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {missingEmails.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>{p.full_name || "—"}</TableCell>
                        <TableCell>{getRoleLabel(p.role)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <h4 className="text-sm font-semibold">20 derniers envois</h4>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Étape</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Destinataire</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentDeliveries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground text-sm py-6">
                        Aucun envoi journalisé — appliquez la migration étape Y en prod.
                      </TableCell>
                    </TableRow>
                  ) : (
                    recentDeliveries.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="text-xs whitespace-nowrap">
                          {format(new Date(d.created_at), "dd/MM/yy HH:mm", { locale: fr })}
                        </TableCell>
                        <TableCell>{d.step_number ?? "—"}</TableCell>
                        <TableCell className="text-xs">{d.notification_type}</TableCell>
                        <TableCell className="text-xs max-w-[140px] truncate">
                          {d.recipient_email || "—"}
                        </TableCell>
                        <TableCell>{statusBadge(d.status)}</TableCell>
                        <TableCell className="text-xs">{d.trigger_source}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Search className="h-5 w-5" />
            Simulateur workflow
          </CardTitle>
          <CardDescription>
            Analysez les destinataires réels d&apos;un courrier/étape (dry run) ou forcez un envoi test.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label>Rechercher un courrier</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Référence ou objet…"
                  value={mailQuery}
                  onChange={(e) => setMailQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), searchMails())}
                />
                <Button type="button" variant="secondary" onClick={searchMails}>
                  <Search className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Courrier</Label>
              <Select value={selectedMailId} onValueChange={setSelectedMailId}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionnez après recherche" />
                </SelectTrigger>
                <SelectContent>
                  {mailResults.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.reference_number} — {m.subject?.slice(0, 40)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Étape</Label>
              <Select value={String(simStep)} onValueChange={(v) => setSimStep(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {activeSteps.map((s) => (
                    <SelectItem key={s.step_order} value={String(s.step_order)}>
                      {s.step_order} — {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Type de notification</Label>
              <Select value={simType} onValueChange={(v) => setSimType(v as typeof simType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="register">Enregistrement (register)</SelectItem>
                  <SelectItem value="transition">Transition workflow</SelectItem>
                  <SelectItem value="pre_assignment">Pré-assignation étape 4</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {selectedMail && (
            <p className="text-sm text-muted-foreground">
              Courrier : <strong>{selectedMail.reference_number}</strong> — {selectedMail.subject}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={simulating || !selectedMailId}
              onClick={() => runSimulation(false)}
            >
              {simulating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
              Analyser (dry run)
            </Button>
            <Button
              type="button"
              disabled={simulating || !selectedMailId}
              onClick={() => runSimulation(true)}
            >
              {simulating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
              Envoyer test workflow
            </Button>
          </div>

          {simResult && (
            <div className="space-y-2 rounded-lg border p-4">
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge variant="outline">Envoyés: {simResult.sent}</Badge>
                <Badge variant="outline">Échecs: {simResult.failed}</Badge>
                <Badge variant="outline">Ignorés: {simResult.skipped}</Badge>
                {simResult.dry_run && <Badge>Simulation</Badge>}
                {simResult.notify_enabled === false && (
                  <Badge variant="secondary">Toggle étape OFF (force_send ignoré sauf test)</Badge>
                )}
              </div>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Destinataire</TableHead>
                      <TableHead>E-mail</TableHead>
                      <TableHead>Mode</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead>Détail</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {simResult.recipients.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground text-sm">
                          Aucun destinataire
                        </TableCell>
                      </TableRow>
                    ) : (
                      simResult.recipients.map((r, i) => (
                        <TableRow key={`${r.recipient_user_id}-${i}`}>
                          <TableCell>{r.recipient_name || r.recipient_user_id.slice(0, 8)}</TableCell>
                          <TableCell className="text-xs">{r.recipient_email || "—"}</TableCell>
                          <TableCell className="text-xs">{r.access_mode || "—"}</TableCell>
                          <TableCell>{statusBadge(r.status)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {r.skip_reason || r.error_message || r.provider_message_id || "—"}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4" />
            Test canal direct
          </CardTitle>
          <CardDescription>
            Utilisez le testeur ci-dessous pour valider Resend/SMTP isolément (sans parcours workflow).
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
