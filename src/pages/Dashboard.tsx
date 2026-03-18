import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Mail, Inbox, CheckCircle, Clock, AlertTriangle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { getStepLabel, getStepColor, WORKFLOW_STEPS } from "@/lib/workflow-engine";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useNavigate } from "react-router-dom";

interface Stats {
  total: number;
  pending: number;
  inProgress: number;
  processed: number;
  overdue: number;
}

export default function Dashboard() {
  const { profile, role } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats>({ total: 0, pending: 0, inProgress: 0, processed: 0, overdue: 0 });
  const [recentMails, setRecentMails] = useState<any[]>([]);
  const [overdueMails, setOverdueMails] = useState<any[]>([]);
  const [stepDistribution, setStepDistribution] = useState<{ name: string; value: number }[]>([]);

  const showOverduePanel = role === "ministre" || role === "dircab" || role === "admin" || role === "superadmin";

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

      // Fetch overdue mails with details + reminder counts
      if (showOverduePanel) {
        const now = new Date().toISOString();
        const { data: overdue } = await supabase
          .from("mails")
          .select("id, subject, sender_name, reference_number, current_step, deadline_at, priority, assigned_agent_id")
          .lt("deadline_at", now)
          .not("status", "in", '("archived","processed")')
          .order("deadline_at", { ascending: true })
          .limit(20);
        
        // Fetch reminder counts for step 4 assignments
        if (overdue && overdue.length > 0) {
          const mailIds = overdue.map(m => m.id);
          const { data: assignmentData } = await supabase
            .from("mail_assignments")
            .select("mail_id, reminder_count")
            .in("mail_id", mailIds)
            .eq("step_number", 4);
          
          const reminderMap = new Map<string, number>();
          assignmentData?.forEach(a => {
            const current = reminderMap.get(a.mail_id) || 0;
            reminderMap.set(a.mail_id, Math.max(current, a.reminder_count || 0));
          });
          
          setOverdueMails(overdue.map(m => ({ ...m, maxReminderCount: reminderMap.get(m.id) || 0 })));
        } else {
          setOverdueMails([]);
        }
      }
    };
    fetchStats();
  }, [showOverduePanel]);

  const statCards = [
    { label: "Total Courriers", value: stats.total, icon: Mail, color: "text-primary" },
    { label: "En attente", value: stats.pending, icon: Clock, color: "text-warning" },
    { label: "En cours", value: stats.inProgress, icon: Inbox, color: "text-info" },
    { label: "Traités / Archivés", value: stats.processed, icon: CheckCircle, color: "text-success" },
    { label: "En retard (SLA)", value: stats.overdue, icon: AlertTriangle, color: "text-destructive" },
  ];

  const COLORS = ["hsl(199,89%,48%)", "hsl(270,60%,55%)", "hsl(38,92%,50%)", "hsl(152,69%,40%)", "hsl(25,90%,55%)", "hsl(190,80%,45%)", "hsl(215,28%,50%)"];

  const getOverdueHours = (deadline: string) => {
    const diff = Date.now() - new Date(deadline).getTime();
    return Math.floor(diff / (1000 * 60 * 60));
  };

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

      {/* Overdue Panel - Ministre/DirCab only */}
      {showOverduePanel && overdueMails.length > 0 && (
        <div className="stat-card border-destructive/30">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <h3 className="text-sm font-semibold text-destructive">
              Tableau de bord des retards — {overdueMails.length} dossier(s) en dépassement SLA
            </h3>
          </div>
          <div className="overflow-auto max-h-64">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="text-left py-2 pr-3">Référence</th>
                  <th className="text-left py-2 pr-3">Objet</th>
                  <th className="text-left py-2 pr-3">Étape</th>
                  <th className="text-left py-2 pr-3">Retard</th>
                  <th className="text-left py-2">Priorité</th>
                </tr>
              </thead>
              <tbody>
                {overdueMails.map((mail: any) => {
                  const overdueHours = getOverdueHours(mail.deadline_at);
                  const reminderCount = mail.maxReminderCount || 0;
                  const isCritical = overdueHours > 72 && reminderCount >= 2;
                  const isWarning = overdueHours > 72;

                  return (
                  <tr
                    key={mail.id}
                    className={`border-b last:border-0 hover:bg-accent/50 cursor-pointer transition-colors ${isCritical ? "bg-destructive/10" : isWarning ? "bg-warning/5" : ""}`}
                    onClick={() => navigate("/inbox")}
                  >
                    <td className="py-2 pr-3 font-mono text-xs">{mail.reference_number}</td>
                    <td className="py-2 pr-3 truncate max-w-[200px]">{mail.subject}</td>
                    <td className="py-2 pr-3">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${getStepColor(mail.current_step || 1)}`}>
                        É{mail.current_step}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`font-medium text-xs ${isCritical ? "text-destructive" : "text-warning"}`}>
                        +{overdueHours}h
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      {isCritical ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-destructive/15 text-destructive font-bold">🚨 Critique</span>
                      ) : isWarning ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-warning/15 text-warning font-medium">⚠️ Retard</span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">En retard</span>
                      )}
                    </td>
                    <td className="py-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                        mail.priority === "urgent" ? "bg-destructive/10 text-destructive" :
                        mail.priority === "high" ? "bg-warning/10 text-warning" :
                        "bg-muted text-muted-foreground"
                      }`}>
                        {mail.priority}
                      </span>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

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