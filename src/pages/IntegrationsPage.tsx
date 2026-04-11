import {
  Mail, Bot, Plane, CalendarDays, Users, Briefcase, Receipt, Archive, Webhook,
  Building2, Lock, CheckCircle2, FileText, PenTool, BarChart3, Key,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ModuleCard {
  name: string;
  description: string;
  icon: React.ElementType;
  status: "active" | "soon" | "preparing";
}

const activeModules: ModuleCard[] = [
  { name: "Notifications Email", description: "Envoi automatique via SMTP sur transitions et alertes SLA", icon: Mail, status: "active" },
  { name: "Assistant IA", description: "Analyse de documents et génération de brouillons via Gemini Flash", icon: Bot, status: "active" },
  { name: "Missions Officielles", description: "Suivi des déplacements et ordres de mission", icon: Plane, status: "active" },
  { name: "Réunions & RDV", description: "Planification d'événements liés aux courriers", icon: CalendarDays, status: "active" },
  { name: "API REST Publique", description: "Endpoints sécurisés par clé API pour les intégrations tierces", icon: Key, status: "active" },
  { name: "Multi-tenant", description: "Partitionnement des données par organisation", icon: Building2, status: "active" },
];

const businessModules: ModuleCard[] = [
  { name: "CRM", description: "Gestion de la relation citoyenne et suivi des contacts", icon: Users, status: "soon" },
  { name: "Gestion RH", description: "Suivi du personnel, congés et évaluations", icon: Briefcase, status: "soon" },
  { name: "Comptabilité", description: "Gestion budgétaire et suivi des dépenses", icon: Receipt, status: "soon" },
  { name: "Archivage Légal", description: "Conservation certifiée et conformité réglementaire", icon: Archive, status: "soon" },
  { name: "Webhooks Sortants", description: "Notifications en temps réel vers des systèmes externes", icon: Webhook, status: "soon" },
  { name: "Gestion Documentaire", description: "Classement, versionnage et recherche de documents", icon: FileText, status: "soon" },
  { name: "Parapheur Électronique", description: "Signature et validation dématérialisée des documents", icon: PenTool, status: "soon" },
  { name: "Tableau de Bord Décisionnel", description: "Indicateurs stratégiques et rapports avancés", icon: BarChart3, status: "soon" },
];

const statusConfig = {
  active: { label: "Actif", variant: "default" as const, className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  preparing: { label: "En préparation", variant: "secondary" as const, className: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  soon: { label: "Bientôt", variant: "outline" as const, className: "bg-muted text-muted-foreground" },
};

function ModuleGrid({ modules }: { modules: ModuleCard[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {modules.map((mod) => {
        const sc = statusConfig[mod.status];
        const isLocked = mod.status === "soon";

        return (
          <Card
            key={mod.name}
            className={`relative overflow-hidden transition-colors ${
              isLocked ? "opacity-60" : "hover:border-primary/30"
            }`}
          >
            <CardContent className="p-5 space-y-3">
              <div className="flex items-start justify-between">
                <div className={`p-2.5 rounded-lg ${isLocked ? "bg-muted" : "bg-primary/10"}`}>
                  {isLocked ? (
                    <Lock className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <mod.icon className="h-5 w-5 text-primary" />
                  )}
                </div>
                <Badge variant={sc.variant} className={`text-[10px] px-2 py-0.5 ${sc.className}`}>
                  {mod.status === "active" && <CheckCircle2 className="h-3 w-3 mr-1" />}
                  {sc.label}
                </Badge>
              </div>
              <div>
                <p className="font-semibold text-sm">{mod.name}</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{mod.description}</p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export default function IntegrationsPage() {
  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="page-header">Intégrations & Modules</h1>
        <p className="page-description">
          Gérez les modules actifs et découvrez les fonctionnalités à venir
        </p>
      </div>

      {/* Active modules */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Modules actifs</h2>
        <ModuleGrid modules={activeModules} />
      </div>

      {/* Business modules */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Modules métier</h2>
          <p className="text-sm text-muted-foreground">
            Fonctionnalités en cours de développement — bientôt disponibles
          </p>
        </div>
        <ModuleGrid modules={businessModules} />
      </div>
    </div>
  );
}
