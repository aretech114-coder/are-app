import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import {
  Inbox as InboxIcon,
  Send,
  Plus,
  Settings,
  Download,
  FileText,
  Search,
  Pencil,
  Archive as ArchiveIcon,
  Users,
  Lock,
  AlertTriangle,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import ExcelJS from "exceljs";
import { MailRegistrationSheet } from "@/components/MailRegistrationSheet";
import { RegistrySettingsDialog } from "@/components/RegistrySettingsDialog";
import { MailEditDialog } from "@/components/MailEditDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

type Direction = "entrant" | "sortant";
type SlaFilter = "all" | "ontime" | "soon" | "overdue";

const priorityColors: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  normal: "bg-info/10 text-info",
  high: "bg-warning/10 text-warning",
  urgent: "bg-destructive/10 text-destructive",
};

const statusColors: Record<string, string> = {
  pending: "bg-warning/10 text-warning",
  in_progress: "bg-info/10 text-info",
  archived: "bg-muted text-muted-foreground",
};

export default function RegistrePage() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const isAdmin = role === "admin" || role === "superadmin";

  const [direction, setDirection] = useState<Direction>("entrant");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editingMail, setEditingMail] = useState<any | null>(null);
  const [reassignMailId, setReassignMailId] = useState<string | null>(null);
  const [reassignTargetUserId, setReassignTargetUserId] = useState<string>("");

  const { data: reassignableUsers = [] } = useQuery({
    queryKey: ["registre-reassignable-users"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .order("full_name");
      return data ?? [];
    },
  });

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterService, setFilterService] = useState("all");
  const [filterSla, setFilterSla] = useState<SlaFilter>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: types = [] } = useQuery({
    queryKey: ["mail_types"],
    queryFn: async () => {
      const { data } = await supabase
        .from("mail_types")
        .select("*")
        .eq("is_active", true)
        .order("label");
      return data ?? [];
    },
  });

  const { data: services = [] } = useQuery({
    queryKey: ["services_concernes"],
    queryFn: async () => {
      const { data } = await supabase
        .from("services_concernes")
        .select("*")
        .eq("is_active", true)
        .order("label");
      return data ?? [];
    },
  });

  const { data: mails = [], isLoading, refetch } = useQuery({
    queryKey: ["registre-mails", direction],
    queryFn: async () => {
      const res: any = await (supabase.from("mails") as any)
        .select(
          "id, reference_number, subject, sender_name, sender_organization, mail_type, priority, status, created_at, reception_date, addressed_to, current_step, deadline_at, locked_for_edit, direction, target_service_id, registered_by, province_code"
        )
        .eq("direction", direction)
        .order("created_at", { ascending: false })
        .limit(500);
      return (res.data ?? []) as any[];
    },
    enabled: !!user,
  });

  // Realtime — update locks & status in place
  useEffect(() => {
    const channel = supabase
      .channel("registre-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "mails" },
        () => qc.invalidateQueries({ queryKey: ["registre-mails"] })
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "workflow_transitions" },
        () => qc.invalidateQueries({ queryKey: ["registre-mails"] })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const filtered = useMemo(() => {
    const now = Date.now();
    return mails.filter((m: any) => {
      if (search) {
        const q = search.toLowerCase();
        const hit =
          m.subject?.toLowerCase().includes(q) ||
          m.sender_name?.toLowerCase().includes(q) ||
          m.reference_number?.toLowerCase().includes(q);
        if (!hit) return false;
      }
      if (filterStatus !== "all" && m.status !== filterStatus) return false;
      if (filterPriority !== "all" && m.priority !== filterPriority) return false;
      if (filterType !== "all" && m.mail_type !== filterType) return false;
      if (filterService !== "all" && m.target_service_id !== filterService) return false;
      if (dateFrom && new Date(m.created_at) < new Date(dateFrom)) return false;
      if (dateTo && new Date(m.created_at) > new Date(dateTo + "T23:59:59")) return false;
      if (filterSla !== "all" && m.deadline_at) {
        const dl = new Date(m.deadline_at).getTime();
        const diffH = (dl - now) / 3_600_000;
        if (filterSla === "ontime" && diffH < 24) return false;
        if (filterSla === "soon" && (diffH <= 0 || diffH >= 24)) return false;
        if (filterSla === "overdue" && diffH > 0) return false;
      }
      return true;
    });
  }, [
    mails,
    search,
    filterStatus,
    filterPriority,
    filterType,
    filterService,
    filterSla,
    dateFrom,
    dateTo,
  ]);

  // KPI cards
  const kpis = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const monthCount = mails.filter(
      (m: any) => new Date(m.created_at).getTime() >= monthStart
    ).length;
    const pending = mails.filter((m: any) => m.status === "pending").length;
    const overdue = mails.filter(
      (m: any) =>
        m.deadline_at && new Date(m.deadline_at).getTime() < Date.now() && m.status !== "archived"
    ).length;
    const archived = mails.filter(
      (m: any) =>
        m.status === "archived" && new Date(m.created_at).getTime() >= monthStart
    ).length;
    return { monthCount, pending, overdue, archived };
  }, [mails]);

  const monthLabel = direction === "entrant" ? "Entrants ce mois" : "Sortants ce mois";

  // Actions
  const handleArchive = async (id: string) => {
    if (!user) return;
    const { error } = await supabase.rpc("advance_workflow_step", {
      _mail_id: id,
      _action: "archive",
      _performed_by: user.id,
      _notes: "Archivé depuis le registre",
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Courrier archivé.");
      refetch();
    }
  };

  const openReassign = (id: string) => {
    setReassignTargetUserId("");
    setReassignMailId(id);
  };

  const confirmReassign = async () => {
    if (!reassignMailId || !reassignTargetUserId || !user) return;
    const id = reassignMailId;
    const targetId = reassignTargetUserId;
    const mail = mails.find((m: any) => m.id === id);
    const step = mail?.current_step || 1;
    await supabase
      .from("mail_assignments")
      .update({ status: "reverted" })
      .eq("mail_id", id)
      .eq("step_number", step)
      .eq("status", "pending");
    const { error } = await supabase.from("mail_assignments").insert({
      mail_id: id,
      assigned_by: user.id,
      assigned_to: targetId,
      step_number: step,
      status: "pending",
      instructions: "Réassignation depuis le registre",
    });
    if (error) return toast.error(error.message);
    await supabase.from("notifications").insert({
      user_id: targetId,
      title: "Courrier réassigné",
      message: `Un courrier vous a été réassigné.`,
      mail_id: id,
    });
    toast.success("Réassigné.");
    setReassignMailId(null);
    setReassignTargetUserId("");
    refetch();
  };

  const handleEdit = (m: any) => {
    if (m.locked_for_edit) {
      toast.error("Ce courrier est verrouillé (déjà pris en charge).");
      return;
    }
    setEditingMail(m);
  };

  // Exports
  const exportCSV = () => {
    const headers = ["N°", "Date", "Expéditeur/Destinataire", "Objet", "Type", "Urgence", "Statut"];
    const rows = filtered.map((m: any) =>
      [
        m.reference_number,
        format(new Date(m.created_at), "dd/MM/yyyy HH:mm"),
        m.sender_name,
        m.subject?.replace(/[,;\n]/g, " "),
        m.mail_type || "",
        m.priority,
        m.status,
      ]
        .map((v) => `"${(v ?? "").toString().replace(/"/g, '""')}"`)
        .join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `registre_${direction}_${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(`Registre ${direction}`);
    ws.columns = [
      { header: "N°", key: "ref", width: 18 },
      { header: "Date", key: "date", width: 18 },
      { header: direction === "entrant" ? "Expéditeur" : "Destinataire", key: "from", width: 24 },
      { header: "Objet", key: "subject", width: 36 },
      { header: "Type", key: "type", width: 16 },
      { header: "Urgence", key: "priority", width: 12 },
      { header: "Statut", key: "status", width: 14 },
    ];
    filtered.forEach((m: any) =>
      ws.addRow({
        ref: m.reference_number,
        date: format(new Date(m.created_at), "dd/MM/yyyy HH:mm", { locale: fr }),
        from: m.sender_name,
        subject: m.subject,
        type: m.mail_type || "",
        priority: m.priority,
        status: m.status,
      })
    );
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `registre_${direction}_${format(new Date(), "yyyy-MM-dd")}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <TooltipProvider>
      <div className="animate-fade-in space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="page-header">Registre des courriers</h1>
            <p className="page-description">
              Enregistrement officiel ISO 9001 / 15489 — entrants et sortants.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5">
              <Download className="h-4 w-4" /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={exportPDF} className="gap-1.5">
              <FileText className="h-4 w-4" /> Exporter le registre
            </Button>
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSettingsOpen(true)}
                className="gap-1.5"
              >
                <Settings className="h-4 w-4" /> Paramètres
              </Button>
            )}
            <Button size="sm" onClick={() => setSheetOpen(true)} className="gap-1.5">
              <Plus className="h-4 w-4" />
              Nouveau courrier {direction === "entrant" ? "entrant" : "sortant"}
            </Button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard
            icon={<InboxIcon className="h-5 w-5 text-primary" />}
            tone="bg-primary/10"
            value={kpis.monthCount}
            label={monthLabel}
          />
          <KpiCard
            icon={<Clock className="h-5 w-5 text-warning" />}
            tone="bg-warning/10"
            value={kpis.pending}
            label="En attente"
          />
          <KpiCard
            icon={<AlertTriangle className="h-5 w-5 text-destructive" />}
            tone="bg-destructive/10"
            value={kpis.overdue}
            label="SLA dépassé"
          />
          <KpiCard
            icon={<CheckCircle2 className="h-5 w-5 text-muted-foreground" />}
            tone="bg-muted"
            value={kpis.archived}
            label="Archivés (mois)"
          />
        </div>

        {/* Filtres */}
        <Card>
          <CardContent className="p-4 flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[220px]">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Statuts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous statuts</SelectItem>
                <SelectItem value="pending">En attente</SelectItem>
                <SelectItem value="in_progress">En cours</SelectItem>
                <SelectItem value="archived">Archivés</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterPriority} onValueChange={setFilterPriority}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Urgences" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes urgences</SelectItem>
                <SelectItem value="low">Basse</SelectItem>
                <SelectItem value="normal">Normale</SelectItem>
                <SelectItem value="high">Haute</SelectItem>
                <SelectItem value="urgent">Urgente</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous types</SelectItem>
                {types.map((t: any) => (
                  <SelectItem key={t.id} value={t.code}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterService} onValueChange={setFilterService}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Services" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous services</SelectItem>
                {services.map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterSla} onValueChange={(v) => setFilterSla(v as SlaFilter)}>
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">SLA (tous)</SelectItem>
                <SelectItem value="ontime">À l'heure</SelectItem>
                <SelectItem value="soon">Bientôt dû</SelectItem>
                <SelectItem value="overdue">En retard</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-end gap-2 border-l pl-3">
              <div>
                <p className="text-[11px] text-muted-foreground mb-1">Filtrer par lot</p>
                <div className="flex gap-1.5">
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-[140px]"
                  />
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-[140px]"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs + Tableau */}
        <Tabs value={direction} onValueChange={(v) => setDirection(v as Direction)}>
          <TabsList>
            <TabsTrigger value="entrant" className="gap-1.5">
              <InboxIcon className="h-4 w-4" /> Entrants
            </TabsTrigger>
            <TabsTrigger value="sortant" className="gap-1.5">
              <Send className="h-4 w-4" /> Sortants
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="border rounded-lg overflow-auto bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-left p-3 font-medium">N°</th>
                <th className="text-left p-3 font-medium">Date</th>
                <th className="text-left p-3 font-medium">
                  {direction === "entrant" ? "Expéditeur" : "Destinataire"}
                </th>
                <th className="text-left p-3 font-medium">Objet</th>
                <th className="text-left p-3 font-medium">Type</th>
                <th className="text-left p-3 font-medium">Urgence</th>
                <th className="text-left p-3 font-medium">Statut</th>
                <th className="text-right p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-muted-foreground">
                    Chargement...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-muted-foreground">
                    Aucun courrier
                  </td>
                </tr>
              ) : (
                filtered.map((m: any) => (
                  <tr key={m.id} className="border-b hover:bg-accent/20 transition-colors">
                    <td className="p-3 font-mono text-xs">{m.reference_number}</td>
                    <td className="p-3 text-xs whitespace-nowrap">
                      {format(new Date(m.created_at), "dd MMM yyyy HH:mm", { locale: fr })}
                    </td>
                    <td className="p-3">
                      <div className="font-medium">{m.sender_name}</div>
                      {m.sender_organization && (
                        <div className="text-xs text-muted-foreground">
                          {m.sender_organization}
                        </div>
                      )}
                    </td>
                    <td className="p-3 max-w-[260px] truncate">{m.subject}</td>
                    <td className="p-3 capitalize text-xs">{m.mail_type || "—"}</td>
                    <td className="p-3">
                      <Badge variant="outline" className={priorityColors[m.priority] || ""}>
                        {m.priority}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <Badge variant="outline" className={statusColors[m.status] || ""}>
                        {m.status}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-end gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(m)}
                              disabled={m.locked_for_edit}
                              className="h-8 w-8"
                            >
                              {m.locked_for_edit ? (
                                <Lock className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <Pencil className="h-4 w-4" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {m.locked_for_edit
                              ? "Verrouillé — courrier en traitement"
                              : "Modifier"}
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleArchive(m.id)}
                              className="h-8 w-8"
                              disabled={m.status === "archived"}
                            >
                              <ArchiveIcon className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Archiver</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openReassign(m.id)}
                              className="h-8 w-8"
                            >
                              <Users className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Réassigner</TooltipContent>
                        </Tooltip>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Drawer & Settings */}
        <MailRegistrationSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          direction={direction}
          onCreated={() => refetch()}
        />
        <RegistrySettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />

        {editingMail && (
          <MailEditDialog
            mail={editingMail}
            open={!!editingMail}
            onOpenChange={(o) => !o && setEditingMail(null)}
            onSaved={() => {
              setEditingMail(null);
              refetch();
            }}
          />
        )}

        <Dialog
          open={!!reassignMailId}
          onOpenChange={(o) => {
            if (!o) {
              setReassignMailId(null);
              setReassignTargetUserId("");
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Réassigner le courrier</DialogTitle>
              <DialogDescription>
                Sélectionnez l'utilisateur à qui transférer ce courrier.
              </DialogDescription>
            </DialogHeader>
            <div className="py-2">
              <Select
                value={reassignTargetUserId}
                onValueChange={setReassignTargetUserId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choisir un utilisateur" />
                </SelectTrigger>
                <SelectContent>
                  {reassignableUsers.map((u: any) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.full_name || u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setReassignMailId(null);
                  setReassignTargetUserId("");
                }}
              >
                Annuler
              </Button>
              <Button
                onClick={confirmReassign}
                disabled={!reassignTargetUserId}
              >
                Réassigner
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}

function KpiCard({
  icon,
  tone,
  value,
  label,
}: {
  icon: React.ReactNode;
  tone: string;
  value: number;
  label: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`p-2 rounded-lg ${tone}`}>{icon}</div>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}