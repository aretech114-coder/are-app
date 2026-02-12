import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from "recharts";
import { TrendingUp, Clock, Users, Zap } from "lucide-react";

const COLORS = ["hsl(199, 89%, 48%)", "hsl(38, 92%, 50%)", "hsl(152, 69%, 40%)", "hsl(0, 72%, 51%)"];

export default function AnalyticsPage() {
  const [stats, setStats] = useState({ total: 0, avgTime: "2.4h", pending: 0, processed: 0 });
  const [statusData, setStatusData] = useState<any[]>([]);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase.from("mails").select("status, priority, created_at");
      if (data) {
        const counts: Record<string, number> = {};
        data.forEach((m) => { counts[m.status] = (counts[m.status] || 0) + 1; });
        setStatusData([
          { name: "En attente", value: counts.pending || 0 },
          { name: "En cours", value: counts.in_progress || 0 },
          { name: "Traité", value: counts.processed || 0 },
          { name: "Archivé", value: counts.archived || 0 },
        ]);
        setStats({
          total: data.length,
          avgTime: "2.4h",
          pending: counts.pending || 0,
          processed: (counts.processed || 0) + (counts.archived || 0),
        });
      }
    };
    fetch();
  }, []);

  const trendData = [
    { name: "Jan", courriers: 45 }, { name: "Fév", courriers: 52 },
    { name: "Mar", courriers: 38 }, { name: "Avr", courriers: 65 },
    { name: "Mai", courriers: 48 }, { name: "Jun", courriers: 72 },
  ];

  const kpis = [
    { label: "Total Courriers", value: stats.total, icon: TrendingUp, color: "text-primary" },
    { label: "Temps Moyen", value: stats.avgTime, icon: Clock, color: "text-warning" },
    { label: "En attente", value: stats.pending, icon: Users, color: "text-info" },
    { label: "Productivité", value: `${stats.processed}`, icon: Zap, color: "text-success" },
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="stat-card">
          <h3 className="text-sm font-semibold mb-4">Tendance Mensuelle</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="name" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip />
              <Line type="monotone" dataKey="courriers" stroke="hsl(199, 89%, 48%)" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="stat-card">
          <h3 className="text-sm font-semibold mb-4">Répartition par Statut</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={statusData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={4} dataKey="value">
                {statusData.map((_, index) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
