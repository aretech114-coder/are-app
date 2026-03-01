import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { WorkflowStepper } from "@/components/WorkflowStepper";
import { WorkflowTimeline } from "@/components/WorkflowTimeline";
import { Step4ContextPanel } from "@/components/Step4ContextPanel";
import { TreatmentsList } from "@/components/TreatmentsList";
import { getStepLabel, getStepColor, WORKFLOW_STEPS } from "@/lib/workflow-engine";
import { Search, CalendarIcon, Filter, Eye, AlertTriangle, Clock, CheckCircle, Archive, BarChart3 } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";

export default function SuiviPage() {
  const { role } = useAuth();
  const [mails, setMails] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterStep, setFilterStep] = useState<string>("all");
  const [filterUser, setFilterUser] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<Date>();
  const [dateTo, setDateTo] = useState<Date>();
  const [selectedMail, setSelectedMail] = useState<any>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const [{ data: mailsData }, { data: profilesData }] = await Promise.all([
      supabase.from("mails").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, full_name, email"),
    ]);
    setMails(mailsData || []);
    setProfiles(profilesData || []);
    setLoading(false);
  };

  const getProfileName = (id: string) => profiles.find(p => p.id === id)?.full_name || "—";

  const isOverdue = (mail: any) => mail.deadline_at && new Date(mail.deadline_at) < new Date() && mail.status !== "archived";

  const filtered = mails.filter(m => {
    if (search && !(
      m.subject?.toLowerCase().includes(search.toLowerCase()) ||
      m.sender_name?.toLowerCase().includes(search.toLowerCase()) ||
      m.reference_number?.toLowerCase().includes(search.toLowerCase())
    )) return false;
    if (filterStatus !== "all" && m.status !== filterStatus) return false;
    if (filterStep !== "all" && String(m.current_step) !== filterStep) return false;
    if (filterUser !== "all" && m.assigned_agent_id !== filterUser && m.registered_by !== filterUser) return false;
    if (filterPriority !== "all" && m.priority !== filterPriority) return false;
    if (dateFrom && new Date(m.created_at) < dateFrom) return false;
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59);
      if (new Date(m.created_at) > end) return false;
    }
    return true;
  });

  // KPIs
  const totalMails = filtered.length;
  const inProgress = filtered.filter(m => m.status === "in_progress").length;
  const archived = filtered.filter(m => m.status === "archived").length;
  const overdue = filtered.filter(m => isOverdue(m)).length;
  const pending = filtered.filter(m => m.status === "pending").length;

  const statusColors: Record<string, string> = {
    pending: "bg-warning/10 text-warning border-warning/30",
    in_progress: "bg-info/10 text-info border-info/30",
    processed: "bg-success/10 text-success border-success/30",
    archived: "bg-muted text-muted-foreground border-border",
  };

  const statusLabels: Record<string, string> = {
    pending: "En attente",
    in_progress: "En cours",
    processed: "Traité",
    archived: "Archivé",
  };

  const priorityLabels: Record<string, string> = {
    low: "Faible",
    normal: "Normal",
    high: "Élevée",
    urgent: "Urgent",
  };

  const clearFilters = () => {
    setSearch("");
    setFilterStatus("all");
    setFilterStep("all");
    setFilterUser("all");
    setFilterPriority("all");
    setDateFrom(undefined);
    setDateTo(undefined);
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="page-header">Tableau de Suivi</h1>
        <p className="page-description">Vue d'ensemble de tous les dossiers et leur progression</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10"><BarChart3 className="h-5 w-5 text-primary" /></div>
            <div>
              <p className="text-2xl font-bold">{totalMails}</p>
              <p className="text-xs text-muted-foreground">Total dossiers</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-warning/10"><Clock className="h-5 w-5 text-warning" /></div>
            <div>
              <p className="text-2xl font-bold">{pending}</p>
              <p className="text-xs text-muted-foreground">En attente</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-info/10"><Filter className="h-5 w-5 text-info" /></div>
            <div>
              <p className="text-2xl font-bold">{inProgress}</p>
              <p className="text-xs text-muted-foreground">En cours</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-destructive/10"><AlertTriangle className="h-5 w-5 text-destructive" /></div>
            <div>
              <p className="text-2xl font-bold">{overdue}</p>
              <p className="text-xs text-muted-foreground">En retard</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-success/10"><CheckCircle className="h-5 w-5 text-success" /></div>
            <div>
              <p className="text-2xl font-bold">{archived}</p>
              <p className="text-xs text-muted-foreground">Archivés</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Rechercher par objet, expéditeur, référence..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
              </div>
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="Statut" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous statuts</SelectItem>
                <SelectItem value="pending">En attente</SelectItem>
                <SelectItem value="in_progress">En cours</SelectItem>
                <SelectItem value="processed">Traité</SelectItem>
                <SelectItem value="archived">Archivé</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStep} onValueChange={setFilterStep}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Étape" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes étapes</SelectItem>
                {WORKFLOW_STEPS.map(s => (
                  <SelectItem key={s.step} value={String(s.step)}>Ét. {s.step}: {s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterPriority} onValueChange={setFilterPriority}>
              <SelectTrigger className="w-[130px]"><SelectValue placeholder="Priorité" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes</SelectItem>
                <SelectItem value="low">Faible</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="high">Élevée</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterUser} onValueChange={setFilterUser}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Utilisateur" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous utilisateurs</SelectItem>
                {profiles.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("gap-1", dateFrom && "text-primary")}>
                  <CalendarIcon className="h-3.5 w-3.5" />
                  {dateFrom ? format(dateFrom, "dd/MM/yy") : "Du"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("gap-1", dateTo && "text-primary")}>
                  <CalendarIcon className="h-3.5 w-3.5" />
                  {dateTo ? format(dateTo, "dd/MM/yy") : "Au"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateTo} onSelect={setDateTo} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
            <Button variant="ghost" size="sm" onClick={clearFilters}>Réinitialiser</Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Référence</TableHead>
                <TableHead>Objet</TableHead>
                <TableHead>Expéditeur</TableHead>
                <TableHead>Étape</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Priorité</TableHead>
                <TableHead>Assigné à</TableHead>
                <TableHead>Échéance</TableHead>
                <TableHead>Date</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Chargement...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Aucun dossier trouvé</TableCell></TableRow>
              ) : (
                filtered.map(mail => (
                  <TableRow key={mail.id} className={isOverdue(mail) ? "bg-destructive/5" : ""}>
                    <TableCell className="font-mono text-xs">{mail.reference_number}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm">{mail.subject}</TableCell>
                    <TableCell className="text-sm">{mail.sender_name}</TableCell>
                    <TableCell>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap ${getStepColor(mail.current_step || 1)}`}>
                        {getStepLabel(mail.current_step || 1)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] ${statusColors[mail.status] || ""}`}>
                        {statusLabels[mail.status] || mail.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        {priorityLabels[mail.priority] || mail.priority}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{mail.assigned_agent_id ? getProfileName(mail.assigned_agent_id) : "—"}</TableCell>
                    <TableCell className="text-xs">
                      {mail.deadline_at ? (
                        <span className={isOverdue(mail) ? "text-destructive font-medium" : ""}>
                          {isOverdue(mail) && <AlertTriangle className="h-3 w-3 inline mr-1" />}
                          {format(new Date(mail.deadline_at), "dd/MM HH:mm")}
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(mail.created_at), "dd/MM/yy")}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => setSelectedMail(mail)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!selectedMail} onOpenChange={(open) => !open && setSelectedMail(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Détails du dossier — {selectedMail?.reference_number}
            </DialogTitle>
          </DialogHeader>
          {selectedMail && (
            <div className="space-y-4">
              <WorkflowStepper currentStep={selectedMail.current_step || 1} />
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Objet:</span> <strong>{selectedMail.subject}</strong></div>
                <div><span className="text-muted-foreground">Expéditeur:</span> {selectedMail.sender_name}</div>
                <div><span className="text-muted-foreground">Statut:</span> <Badge variant="outline" className={statusColors[selectedMail.status]}>{statusLabels[selectedMail.status]}</Badge></div>
                <div><span className="text-muted-foreground">Priorité:</span> {priorityLabels[selectedMail.priority]}</div>
                <div><span className="text-muted-foreground">Type:</span> {selectedMail.mail_type || "—"}</div>
                <div><span className="text-muted-foreground">Assigné à:</span> {selectedMail.assigned_agent_id ? getProfileName(selectedMail.assigned_agent_id) : "—"}</div>
                {selectedMail.deadline_at && (
                  <div className={isOverdue(selectedMail) ? "text-destructive" : ""}>
                    <span className="text-muted-foreground">Échéance:</span> {format(new Date(selectedMail.deadline_at), "dd MMMM yyyy HH:mm", { locale: fr })}
                    {isOverdue(selectedMail) && " ⚠️ EN RETARD"}
                  </div>
                )}
              </div>
              {selectedMail.description && (
                <div className="p-3 rounded-lg bg-muted/30 text-sm whitespace-pre-wrap">{selectedMail.description}</div>
              )}
              <TreatmentsList mailId={selectedMail.id} />
              <Step4ContextPanel mailId={selectedMail.id} />
              <div className="p-3 rounded-lg border bg-muted/20">
                <h4 className="text-sm font-semibold mb-2">Historique du workflow</h4>
                <WorkflowTimeline mailId={selectedMail.id} />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
