import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Mail, Inbox, CheckCircle, Clock, AlertTriangle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { getStepLabel, getStepColor, WORKFLOW_STEPS } from "@/lib/workflow-engine";

interface Stats {
  total: number;
  pending: number;
  inProgress: number;
  processed: number;
  overdue: number;
}

export default function Dashboard() {
  const { profile, role } = useAuth();
  const [stats, setStats] = useState<Stats>({ total: 0, pending: 0, inProgress: 0, processed: 0, overdue: 0 });
  const [recentMails, setRecentMails] = useState<any[]>([]);
  const [stepDistribution, setStepDistribution] = useState<{ name: string; value: number }[]>([]);

  useEffect(() => {
    const fetchStats = async () => {
      const { data } = await supabase.from("mails").select("status, current_step, deadline_at");
      if (data) {
        const now = new Date();
        setStats({
          total: data.length,
          pending: data.filter((m) => m.status === "pending").length,
          inProgress: data.filter((m) => m.status === "in_progress").length,
          processed: data.filter((m) => m.status === "processed" || m.status === "archived").length,
          overdue: data.filter((m) => m.deadline_at && new Date(m.deadline_at) < now && m.status !== "archived" && m.status !== "processed").length,
        });

        // Step distribution
        const stepCounts = WORKFLOW_STEPS.map(s => ({
          name: `É${s.step}`,
          value: data.filter(m => (m.current_step || 1) === s.step && m.status !== "archived").length,
        }));
        setStepDistribution(stepCounts);
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
    { label: "Traités / Archivés", value: stats.processed, icon: CheckCircle, color: "text-success" },
    { label: "En retard (SLA)", value: stats.overdue, icon: AlertTriangle, color: "text-destructive" },
  ];

  const COLORS = ["hsl(199,89%,48%)", "hsl(270,60%,55%)", "hsl(38,92%,50%)", "hsl(152,69%,40%)", "hsl(25,90%,55%)", "hsl(190,80%,45%)", "hsl(215,28%,50%)"];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="page-header">Tableau de Bord</h1>
        <p className="page-description">
          Bienvenue, {profile?.full_name || "Agent"} — Rôle : {role || "agent"}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {statCards.map((card) => (
          <div key={card.label} className="stat-card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{card.label}</p>
                <p className="text-2xl font-bold mt-1">{card.value}</p>
              </div>
              <card.icon className={`h-7 w-7 ${card.color} opacity-80`} />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Step distribution chart */}
        <div className="stat-card">
          <h3 className="text-sm font-semibold mb-4">Distribution par étape du workflow</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={stepDistribution}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="name" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {stepDistribution.map((_, index) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
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
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${getStepColor(mail.current_step || 1)}`}>
                      É{mail.current_step || 1}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      mail.status === "pending" ? "bg-warning/10 text-warning" :
                      mail.status === "in_progress" ? "bg-info/10 text-info" :
                      "bg-success/10 text-success"
                    }`}>
                      {mail.status === "pending" ? "En attente" :
                       mail.status === "in_progress" ? "En cours" : "Traité"}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}