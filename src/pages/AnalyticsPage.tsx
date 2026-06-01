import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from "recharts";
import { TrendingUp, Clock, Users, Zap, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const COLORS = ["hsl(199, 89%, 48%)", "hsl(38, 92%, 50%)", "hsl(152, 69%, 40%)", "hsl(0, 72%, 51%)", "hsl(262, 83%, 58%)"];
const PRIORITY_COLORS: Record<string, string> = {
  urgent: "hsl(0, 72%, 51%)",
  high: "hsl(25, 95%, 53%)",
  normal: "hsl(199, 89%, 48%)",
  low: "hsl(152, 69%, 40%)",
};
const MONTHS_FR = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jui", "Aoû", "Sep", "Oct", "Nov", "Déc"];

type MailRow = {
  status: string;
  priority: string;
  current_step: number | null;
  created_at: string;
  workflow_started_at: string | null;
  workflow_completed_at: string | null;
  deadline_at: string | null;
};

export default function AnalyticsPage() {
  const [mails, setMails] = useState<MailRow[] | null>(null);
  const [stepNames, setStepNames] = useState<Record<number, string>>({});

  useEffect(() => {
    (async () => {
      const [{ data: mailsData }, { data: steps }] = await Promise.all([
        supabase
          .from("mails")
          .select("status, priority, current_step, created_at, workflow_started_at, workflow_completed_at, deadline_at")
          .order("created_at", { ascending: false })
          .limit(1000),
        supabase.from("workflow_steps").select("step_order, name").eq("is_active", true),
      ]);
      setMails((mailsData as MailRow[]) || []);
      const map: Record<number, string> = {};
      (steps || []).forEach((s: any) => { map[s.step_order] = s.name; });
      setStepNames(map);
    })();
  }, []);

  const computed = useMemo(() => {
    if (!mails) return null;
    const total = mails.length;
    const statusCounts: Record<string, number> = {};
    const priorityCounts: Record<string, number> = {};
    const stepCounts: Record<number, number> = {};
    const monthCounts: Record<string, number> = {};
    let processed = 0;
    let overdue = 0;
    let completedDurations: number[] = [];
    const now = Date.now();

    mails.forEach((m) => {
      statusCounts[m.status] = (statusCounts[m.status] || 0) + 1;
      priorityCounts[m.priority] = (priorityCounts[m.priority] || 0) + 1;
      if (m.current_step != null) stepCounts[m.current_step] = (stepCounts[m.current_step] || 0) + 1;

      const d = new Date(m.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthCounts[key] = (monthCounts[key] || 0) + 1;

      if (m.status === "processed" || m.status === "archived") processed++;
      if (m.workflow_completed_at && m.workflow_started_at) {
        completedDurations.push(
          new Date(m.workflow_completed_at).getTime() - new Date(m.workflow_started_at).getTime()
        );
      }
      if (m.deadline_at && new Date(m.deadline_at).getTime() < now &&
          m.status !== "processed" && m.status !== "archived") {
        overdue++;
      }
    });

    const avgMs = completedDurations.length
      ? completedDurations.reduce((a, b) => a + b, 0) / completedDurations.length
      : 0;
    const avgHours = avgMs / 3_600_000;
    const avgLabel = avgHours >= 24
      ? `${(avgHours / 24).toFixed(1)} j`
      : avgHours > 0 ? `${avgHours.toFixed(1)} h` : "—";

    const statusLabels: Record<string, string> = {
      pending: "En attente", in_progress: "En cours", processed: "Traité", archived: "Archivé", rejected: "Rejeté",
    };
    const statusData = Object.entries(statusCounts).map(([k, v]) => ({
      name: statusLabels[k] || k, value: v,
    }));
    const priorityData = Object.entries(priorityCounts).map(([k, v]) => ({
      name: k.charAt(0).toUpperCase() + k.slice(1), value: v, fill: PRIORITY_COLORS[k] || "hsl(199, 89%, 48%)",
    }));
    const stepData = Object.entries(stepCounts)
      .map(([k, v]) => ({ name: stepNames[Number(k)] || `Étape ${k}`, value: v, step: Number(k) }))
      .sort((a, b) => a.step - b.step);

    // Tendance : 6 derniers mois
    const trend: { name: string; courriers: number }[] = [];
    const ref = new Date();
    for (let i = 5; i >= 0; i--) {
      const dt = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
      trend.push({ name: MONTHS_FR[dt.getMonth()], courriers: monthCounts[key] || 0 });
    }

    return {
      total, processed, overdue, avgLabel,
      pending: (statusCounts.pending || 0) + (statusCounts.in_progress || 0),
      completionRate: total ? Math.round((processed / total) * 100) : 0,
      statusData, priorityData, stepData, trend,
    };
  }, [mails, stepNames]);

  if (!computed) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="page-header">Statistiques & Analytiques</h1>
          <p className="page-description">Tableau de bord de performance du système</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-72" /><Skeleton className="h-72" />
        </div>
      </div>
    );
  }

  const kpis = [
    { label: "Total Courriers", value: computed.total, icon: TrendingUp, color: "text-primary" },
    { label: "Temps moyen de traitement", value: computed.avgLabel, icon: Clock, color: "text-warning" },
    { label: "En cours / en attente", value: computed.pending, icon: Users, color: "text-info" },
    { label: "Taux de traitement", value: `${computed.completionRate}%`, icon: CheckCircle2, color: "text-success" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="page-header">Statistiques & Analytiques</h1>
        <p className="page-description">Tableau de bord de performance du système</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="stat-card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{kpi.label}</p>
                <p className="text-3xl font-bold mt-1">{kpi.value}</p>
              </div>
              <kpi.icon className={`h-8 w-8 ${kpi.color} opacity-80`} />
            </div>
          </div>
        ))}
      </div>

      {computed.overdue > 0 && (
        <div className="stat-card border-l-4 border-destructive flex items-center gap-3">
          <AlertTriangle className="h-6 w-6 text-destructive" />
          <div>
            <p className="font-semibold">{computed.overdue} courrier{computed.overdue > 1 ? "s" : ""} en dépassement de délai</p>
            <p className="text-sm text-muted-foreground">Échéance dépassée et workflow non finalisé.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="stat-card">
          <h3 className="text-sm font-semibold mb-4">Tendance — 6 derniers mois</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={computed.trend}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="name" className="text-xs" />
              <YAxis className="text-xs" allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="courriers" stroke="hsl(199, 89%, 48%)" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="stat-card">
          <h3 className="text-sm font-semibold mb-4">Répartition par statut</h3>
          {computed.statusData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Aucune donnée disponible</p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={computed.statusData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={4} dataKey="value">
                  {computed.statusData.map((_, index) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="stat-card">
          <h3 className="text-sm font-semibold mb-4">Répartition par priorité</h3>
          {computed.priorityData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Aucune donnée disponible</p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={computed.priorityData}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="name" className="text-xs" />
                <YAxis className="text-xs" allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {computed.priorityData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="stat-card">
          <h3 className="text-sm font-semibold mb-4">Courriers par étape du workflow</h3>
          {computed.stepData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Aucune donnée disponible</p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={computed.stepData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis type="number" className="text-xs" allowDecimals={false} />
                <YAxis type="category" dataKey="name" className="text-xs" width={120} />
                <Tooltip />
                <Bar dataKey="value" fill="hsl(199, 89%, 48%)" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
