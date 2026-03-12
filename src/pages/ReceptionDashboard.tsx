import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Search, Download, Mail, CalendarDays, Filter } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import ExcelJS from "exceljs";

export default function ReceptionDashboard() {
  const { user } = useAuth();
  const [mails, setMails] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    fetchMails();
  }, [user]);

  const fetchMails = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("mails")
      .select("id, reference_number, subject, sender_name, sender_organization, mail_type, priority, status, created_at, reception_date, addressed_to")
      .eq("registered_by", user.id)
      .order("created_at", { ascending: false });
    setMails(data || []);
    setLoading(false);
  };

  const filtered = mails.filter((m) => {
    const matchSearch =
      !search ||
      m.subject?.toLowerCase().includes(search.toLowerCase()) ||
      m.sender_name?.toLowerCase().includes(search.toLowerCase()) ||
      m.reference_number?.toLowerCase().includes(search.toLowerCase());
    const matchPriority = filterPriority === "all" || m.priority === filterPriority;
    const matchType = filterType === "all" || m.mail_type === filterType;
    const matchDateFrom = !dateFrom || new Date(m.created_at) >= new Date(dateFrom);
    const matchDateTo = !dateTo || new Date(m.created_at) <= new Date(dateTo + "T23:59:59");
    return matchSearch && matchPriority && matchType && matchDateFrom && matchDateTo;
  });

  const todayCount = mails.filter(
    (m) => format(new Date(m.created_at), "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd")
  ).length;

  const exportToExcel = () => {
    const rows = filtered.map((m) => ({
      "Référence": m.reference_number,
      "Objet": m.subject,
      "Expéditeur": m.sender_name,
      "Organisation": m.sender_organization || "",
      "Type": m.mail_type || "standard",
      "Priorité": m.priority,
      "Destinataire": m.addressed_to || "",
      "Date d'enregistrement": format(new Date(m.created_at), "dd/MM/yyyy HH:mm", { locale: fr }),
      "Date de réception": m.reception_date ? format(new Date(m.reception_date), "dd/MM/yyyy", { locale: fr }) : "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Courriers");
    XLSX.writeFile(wb, `courriers_reception_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
  };

  const priorityColors: Record<string, string> = {
    low: "bg-muted text-muted-foreground",
    normal: "bg-info/10 text-info",
    high: "bg-warning/10 text-warning",
    urgent: "bg-destructive/10 text-destructive",
  };

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-header">Registre des Courriers</h1>
          <p className="page-description">Tous les courriers enregistrés par votre poste</p>
        </div>
        <Button onClick={exportToExcel} variant="outline" size="sm" className="gap-2">
          <Download className="h-4 w-4" />
          Exporter Excel
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10"><Mail className="h-5 w-5 text-primary" /></div>
            <div>
              <p className="text-2xl font-bold">{mails.length}</p>
              <p className="text-xs text-muted-foreground">Total enregistrés</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-accent/50"><CalendarDays className="h-5 w-5 text-accent-foreground" /></div>
            <div>
              <p className="text-2xl font-bold">{todayCount}</p>
              <p className="text-xs text-muted-foreground">Aujourd'hui</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-warning/10"><Filter className="h-5 w-5 text-warning" /></div>
            <div>
              <p className="text-2xl font-bold">{mails.filter((m) => m.priority === "urgent" || m.priority === "high").length}</p>
              <p className="text-xs text-muted-foreground">Priorité haute/urgente</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted"><Search className="h-5 w-5 text-muted-foreground" /></div>
            <div>
              <p className="text-2xl font-bold">{filtered.length}</p>
              <p className="text-xs text-muted-foreground">Résultats filtrés</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Rechercher..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
        </div>
        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Priorité" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes</SelectItem>
            <SelectItem value="low">Basse</SelectItem>
            <SelectItem value="normal">Normale</SelectItem>
            <SelectItem value="high">Haute</SelectItem>
            <SelectItem value="urgent">Urgente</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous types</SelectItem>
            <SelectItem value="ordinaire">Ordinaire</SelectItem>
            <SelectItem value="audience">Audience</SelectItem>
            <SelectItem value="presidence">Présidence</SelectItem>
            <SelectItem value="institutionnel">Institutionnel</SelectItem>
            <SelectItem value="interministeriel">Inter-ministériel</SelectItem>
          </SelectContent>
        </Select>
        <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-[150px]" placeholder="Du" />
        <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-[150px]" placeholder="Au" />
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-auto bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="text-left p-3 font-medium">Référence</th>
              <th className="text-left p-3 font-medium">Objet</th>
              <th className="text-left p-3 font-medium">Expéditeur</th>
              <th className="text-left p-3 font-medium">Type</th>
              <th className="text-left p-3 font-medium">Priorité</th>
              <th className="text-left p-3 font-medium">Destinataire</th>
              <th className="text-left p-3 font-medium">Date</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">Chargement...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">Aucun courrier trouvé</td></tr>
            ) : (
              filtered.map((m) => (
                <tr key={m.id} className="border-b hover:bg-accent/30 transition-colors">
                  <td className="p-3 font-mono text-xs">{m.reference_number}</td>
                  <td className="p-3 max-w-[250px] truncate">{m.subject}</td>
                  <td className="p-3">{m.sender_name}</td>
                  <td className="p-3 capitalize">{m.mail_type || "standard"}</td>
                  <td className="p-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${priorityColors[m.priority]}`}>
                      {m.priority}
                    </span>
                  </td>
                  <td className="p-3">{m.addressed_to || "—"}</td>
                  <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                    {format(new Date(m.created_at), "dd MMM yyyy HH:mm", { locale: fr })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
