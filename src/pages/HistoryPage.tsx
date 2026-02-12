import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

export default function HistoryPage() {
  const { user } = useAuth();
  const [history, setHistory] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    const fetchHistory = async () => {
      const { data } = await supabase
        .from("mail_processing_history")
        .select("*, mails(subject, reference_number, sender_name, priority, status)")
        .order("created_at", { ascending: false });
      setHistory(data || []);
    };
    fetchHistory();
  }, []);

  const filtered = history.filter((h) => {
    const matchSearch =
      h.mails?.subject?.toLowerCase().includes(search.toLowerCase()) ||
      h.mails?.reference_number?.toLowerCase().includes(search.toLowerCase()) ||
      h.action?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || h.mails?.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h1 className="page-header">Historique de Traitement</h1>
        <p className="page-description">Votre journal personnel des actions sur les courriers</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous</SelectItem>
            <SelectItem value="pending">En attente</SelectItem>
            <SelectItem value="in_progress">En cours</SelectItem>
            <SelectItem value="processed">Traité</SelectItem>
            <SelectItem value="archived">Archivé</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="border rounded-lg bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Référence</TableHead>
              <TableHead>Objet</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Priorité</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  Aucun historique trouvé
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((h) => (
                <TableRow key={h.id}>
                  <TableCell className="font-mono text-xs">{h.mails?.reference_number}</TableCell>
                  <TableCell className="text-sm">{h.mails?.subject}</TableCell>
                  <TableCell className="text-sm">{h.action}</TableCell>
                  <TableCell>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      h.mails?.priority === "urgent" ? "bg-destructive/10 text-destructive" :
                      h.mails?.priority === "high" ? "bg-warning/10 text-warning" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      {h.mails?.priority}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {format(new Date(h.created_at), "dd/MM/yyyy HH:mm", { locale: fr })}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
