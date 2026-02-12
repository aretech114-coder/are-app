import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Mail, Inbox, CheckCircle, Clock, TrendingUp, AlertTriangle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface Stats {
  total: number;
  pending: number;
  inProgress: number;
  processed: number;
}

export default function Dashboard() {
  const { profile, role } = useAuth();
  const [stats, setStats] = useState<Stats>({ total: 0, pending: 0, inProgress: 0, processed: 0 });
  const [recentMails, setRecentMails] = useState<any[]>([]);

  useEffect(() => {
    const fetchStats = async () => {
      const { data } = await supabase.from("mails").select("status");
      if (data) {
        setStats({
          total: data.length,
          pending: data.filter((m) => m.status === "pending").length,
          inProgress: data.filter((m) => m.status === "in_progress").length,
          processed: data.filter((m) => m.status === "processed").length,
        });
      }
      const { data: recent } = await supabase
        .from("mails")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5);
      setRecentMails(recent || []);
    };
    fetchStats();
  }, []);

  const statCards = [
    { label: "Total Courriers", value: stats.total, icon: Mail, color: "text-primary" },
    { label: "En attente", value: stats.pending, icon: Clock, color: "text-warning" },
    { label: "En cours", value: stats.inProgress, icon: Inbox, color: "text-info" },
    { label: "Traités", value: stats.processed, icon: CheckCircle, color: "text-success" },
  ];

  const chartData = [
    { name: "Lun", value: 12 }, { name: "Mar", value: 19 },
    { name: "Mer", value: 15 }, { name: "Jeu", value: 22 },
    { name: "Ven", value: 18 }, { name: "Sam", value: 5 },
    { name: "Dim", value: 3 },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="page-header">Tableau de Bord</h1>
        <p className="page-description">
          Bienvenue, {profile?.full_name || "Agent"} — Rôle : {role || "agent"}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div key={card.label} className="stat-card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{card.label}</p>
                <p className="text-3xl font-bold mt-1">{card.value}</p>
              </div>
              <card.icon className={`h-8 w-8 ${card.color} opacity-80`} />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="stat-card">
          <h3 className="text-sm font-semibold mb-4">Volume hebdomadaire</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="name" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip />
              <Bar dataKey="value" fill="hsl(199, 89%, 48%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="stat-card">
          <h3 className="text-sm font-semibold mb-4">Courriers récents</h3>
          <div className="space-y-3">
            {recentMails.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Aucun courrier enregistré</p>
            ) : (
              recentMails.map((mail) => (
                <div key={mail.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{mail.subject}</p>
                    <p className="text-xs text-muted-foreground">{mail.sender_name}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    mail.status === "pending" ? "bg-warning/10 text-warning" :
                    mail.status === "in_progress" ? "bg-info/10 text-info" :
                    "bg-success/10 text-success"
                  }`}>
                    {mail.status === "pending" ? "En attente" :
                     mail.status === "in_progress" ? "En cours" : "Traité"}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
