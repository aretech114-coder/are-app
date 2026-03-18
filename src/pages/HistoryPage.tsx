import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WorkflowStepper } from "@/components/WorkflowStepper";
import { WorkflowTimeline } from "@/components/WorkflowTimeline";
import { TreatmentsList } from "@/components/TreatmentsList";
import { Step4ContextPanel } from "@/components/Step4ContextPanel";
import { getStepLabel, getStepColor } from "@/lib/workflow-engine";
import { Search, Eye, CheckCircle, Clock, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface HistoryEntry {
  id: string;
  mail_id: string;
  step_number: number;
  status: string;
  completed_at: string | null;
  created_at: string;
  instructions: string | null;
  mail?: {
    id: string;
    subject: string;
    reference_number: string;
    sender_name: string;
    priority: string;
    status: string;
    current_step: number | null;
    mail_type: string | null;
    addressed_to: string | null;
    deadline_at: string | null;
    created_at: string;
    description: string | null;
    comments: string | null;
    attachment_url: string | null;
    ai_draft: string | null;
    sender_organization: string | null;
    sender_phone: string | null;
    sender_email: string | null;
    sender_address: string | null;
    sender_city: string | null;
    sender_country: string | null;
    reception_date: string | null;
    deposit_time: string | null;
  };
}

const statusLabels: Record<string, string> = {
  pending: "En attente",
  completed: "Terminé",
  proposed: "Proposé",
  acknowledged: "Consulté",
};

const statusColors: Record<string, string> = {
  pending: "bg-warning/10 text-warning border-warning/30",
  completed: "bg-success/10 text-success border-success/30",
  proposed: "bg-info/10 text-info border-info/30",
  acknowledged: "bg-primary/10 text-primary border-primary/30",
};

const mailStatusLabels: Record<string, string> = {
  pending: "En attente",
  in_progress: "En cours",
  processed: "Traité",
  archived: "Archivé",
};

const mailStatusColors: Record<string, string> = {
  pending: "bg-warning/10 text-warning border-warning/30",
  in_progress: "bg-info/10 text-info border-info/30",
  processed: "bg-success/10 text-success border-success/30",
  archived: "bg-muted text-muted-foreground border-border",
};

export default function HistoryPage() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState<HistoryEntry | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchHistory();
  }, [user]);

  const fetchHistory = async () => {
    if (!user) return;
    setLoading(true);

    const { data, error } = await supabase
      .from("mail_assignments")
      .select("id, mail_id, step_number, status, completed_at, created_at, instructions, mails(id, subject, reference_number, sender_name, priority, status, current_step, mail_type, addressed_to, deadline_at, created_at, description, comments, attachment_url, ai_draft, sender_organization, sender_phone, sender_email, sender_address, sender_city, sender_country, reception_date, deposit_time)")
      .eq("assigned_to", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Erreur fetch historique:", error.message);
    }

    const parsed = (data || []).map((d: any) => ({
      ...d,
      mail: d.mails,
    }));

    setEntries(parsed);
    setLoading(false);
  };

  const filtered = entries.filter((e) => {
    const matchSearch =
      e.mail?.subject?.toLowerCase().includes(search.toLowerCase()) ||
      e.mail?.reference_number?.toLowerCase().includes(search.toLowerCase()) ||
      e.mail?.sender_name?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || e.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const isOverdue = (entry: HistoryEntry) => {
    if (!entry.mail?.deadline_at) return false;
    return new Date(entry.mail.deadline_at) < new Date() && entry.mail.status !== "archived";
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="page-header">Historique de Traitement</h1>
        <p className="page-description">Suivi personnel des courriers où vous avez été assigné</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par objet, référence, expéditeur..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Statut assignation" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous</SelectItem>
            <SelectItem value="pending">En attente</SelectItem>
            <SelectItem value="completed">Terminé</SelectItem>
            <SelectItem value="proposed">Proposé</SelectItem>
            <SelectItem value="acknowledged">Consulté</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="border rounded-lg bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Référence</TableHead>
              <TableHead>Objet</TableHead>
              <TableHead>Mon étape</TableHead>
              <TableHead>Mon statut</TableHead>
              <TableHead>Étape actuelle</TableHead>
              <TableHead>Statut courrier</TableHead>
              <TableHead>Date</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  Chargement...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  Aucun historique trouvé
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((entry) => (
                <TableRow
                  key={entry.id}
                  className={`cursor-pointer hover:bg-accent/50 transition-colors ${isOverdue(entry) ? "bg-destructive/5" : ""}`}
                  onClick={() => setSelectedEntry(entry)}
                >
                  <TableCell className="font-mono text-xs">{entry.mail?.reference_number}</TableCell>
                  <TableCell className="text-sm max-w-[200px] truncate">{entry.mail?.subject}</TableCell>
                  <TableCell>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap ${getStepColor(entry.step_number)}`}>
                      É{entry.step_number}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-[10px] ${statusColors[entry.status] || ""}`}>
                      {entry.status === "completed" ? (
                        <span className="flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Terminé</span>
                      ) : entry.status === "pending" ? (
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> En attente</span>
                      ) : (
                        statusLabels[entry.status] || entry.status
                      )}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {entry.mail?.current_step && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap ${getStepColor(entry.mail.current_step)}`}>
                        {getStepLabel(entry.mail.current_step)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-[10px] ${mailStatusColors[entry.mail?.status || ""] || ""}`}>
                      {mailStatusLabels[entry.mail?.status || ""] || entry.mail?.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {format(new Date(entry.created_at), "dd/MM/yyyy HH:mm", { locale: fr })}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setSelectedEntry(entry); }}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!selectedEntry} onOpenChange={(open) => !open && setSelectedEntry(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Détails — {selectedEntry?.mail?.reference_number}
            </DialogTitle>
          </DialogHeader>
          {selectedEntry?.mail && (
            <div className="space-y-4">
              {/* Workflow progress */}
              <WorkflowStepper currentStep={selectedEntry.mail.current_step || 1} />

              {/* My assignment status */}
              <div className={`p-3 rounded-lg border ${
                selectedEntry.status === "completed" ? "bg-success/5 border-success/30" :
                selectedEntry.status === "pending" ? "bg-warning/5 border-warning/30" :
                "bg-muted/30"
              }`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground">Mon intervention</p>
                    <p className="text-sm font-medium">
                      Étape {selectedEntry.step_number} — {getStepLabel(selectedEntry.step_number)}
                    </p>
                  </div>
                  <Badge variant="outline" className={statusColors[selectedEntry.status] || ""}>
                    {selectedEntry.status === "completed" ? "✅ Terminé" :
                     selectedEntry.status === "pending" ? "⏳ En attente" :
                     statusLabels[selectedEntry.status] || selectedEntry.status}
                  </Badge>
                </div>
                {selectedEntry.completed_at && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Complété le {format(new Date(selectedEntry.completed_at), "dd MMMM yyyy à HH:mm", { locale: fr })}
                  </p>
                )}
                {selectedEntry.instructions && (
                  <p className="text-xs text-muted-foreground mt-1 italic">
                    Instructions: {selectedEntry.instructions}
                  </p>
                )}
              </div>

              {/* Mail details categorized by step */}
              <MailDetailFields mail={selectedEntry.mail} />

              {/* Treatments */}
              <TreatmentsList mailId={selectedEntry.mail.id} />

              {/* Context panel (annotations, assignees, meetings) */}
              <Step4ContextPanel mailId={selectedEntry.mail.id} />

              {/* Full workflow timeline */}
              <div className="p-3 rounded-lg border bg-muted/20">
                <h4 className="text-sm font-semibold mb-2">Historique complet du workflow</h4>
                <WorkflowTimeline mailId={selectedEntry.mail.id} />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FieldCategory({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  const colorMap: Record<string, string> = {
    blue: "border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20",
    purple: "border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-950/20",
    amber: "border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20",
    emerald: "border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20",
  };

  return (
    <div className={`p-3 rounded-lg border ${colorMap[color] || "bg-muted/30"}`}>
      <h4 className="text-xs font-semibold text-muted-foreground mb-2">{title}</h4>
      {children}
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium capitalize">{value}</p>
    </div>
  );
}
