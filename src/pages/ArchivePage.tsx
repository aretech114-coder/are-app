import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Archive } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

export default function ArchivePage() {
  const [mails, setMails] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");

  useEffect(() => {
    const fetchArchive = async () => {
      const { data } = await supabase
        .from("mails")
        .select("*")
        .in("status", ["processed", "archived"])
        .order("created_at", { ascending: false });
      setMails(data || []);
    };
    fetchArchive();
  }, []);

  const filtered = mails.filter((m) => {
    const matchSearch =
      m.subject?.toLowerCase().includes(search.toLowerCase()) ||
      m.sender_name?.toLowerCase().includes(search.toLowerCase()) ||
      m.reference_number?.toLowerCase().includes(search.toLowerCase()) ||
      m.qr_code_data?.toLowerCase().includes(search.toLowerCase());
    const matchPriority = priorityFilter === "all" || m.priority === priorityFilter;
    return matchSearch && matchPriority;
  });

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h1 className="page-header">Archives Centrales</h1>
        <p className="page-description">Répertoire global des courriers traités et archivés</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par expéditeur, référence, QR code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Priorité" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes</SelectItem>
            <SelectItem value="low">Basse</SelectItem>
            <SelectItem value="normal">Normale</SelectItem>
            <SelectItem value="high">Haute</SelectItem>
            <SelectItem value="urgent">Urgente</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="border rounded-lg bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Référence</TableHead>
              <TableHead>Objet</TableHead>
              <TableHead>Expéditeur</TableHead>
              <TableHead>Priorité</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  <Archive className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  Aucune archive trouvée
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-mono text-xs">{m.reference_number}</TableCell>
                  <TableCell className="text-sm font-medium">{m.subject}</TableCell>
                  <TableCell className="text-sm">{m.sender_name}</TableCell>
                  <TableCell>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      m.priority === "urgent" ? "bg-destructive/10 text-destructive" :
                      m.priority === "high" ? "bg-warning/10 text-warning" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      {m.priority}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-success/10 text-success">
                      {m.status === "archived" ? "Archivé" : "Traité"}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {format(new Date(m.created_at), "dd/MM/yyyy", { locale: fr })}
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
