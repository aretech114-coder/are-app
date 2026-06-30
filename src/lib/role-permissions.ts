/** Catalogue modules × actions (v1) — extensible via table permission_resources. */
export const PERMISSION_ACTIONS = ["view", "create", "edit", "delete", "download", "export", "treat", "manage"] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export interface PermissionResource {
  resource_key: string;
  label: string;
  actions: PermissionAction[];
  sort_order: number;
}

export const PERMISSION_RESOURCES: PermissionResource[] = [
  { resource_key: "registre", label: "Registre", actions: ["view", "create", "edit", "delete", "export"], sort_order: 10 },
  { resource_key: "inbox", label: "Boîte de réception", actions: ["view", "treat"], sort_order: 20 },
  { resource_key: "archives", label: "Archives centrales", actions: ["view", "download"], sort_order: 30 },
  { resource_key: "suivi", label: "Tableau de suivi", actions: ["view"], sort_order: 40 },
  { resource_key: "history", label: "Historique", actions: ["view"], sort_order: 50 },
  { resource_key: "meetings", label: "Réunions / calendrier", actions: ["view", "create", "edit", "delete"], sort_order: 60 },
  { resource_key: "workflow_config", label: "Configuration workflow", actions: ["view", "manage"], sort_order: 70 },
  { resource_key: "users", label: "Gestion utilisateurs", actions: ["view", "create", "edit", "delete"], sort_order: 80 },
  { resource_key: "integrations", label: "Intégrations", actions: ["view", "manage"], sort_order: 90 },
];

const NON_RECEPTION = new Set([
  "superadmin",
  "admin",
  "supervisor",
  "agent",
  "ministre",
  "directeur",
  "dg",
  "dircab",
  "dircaba",
  "conseiller_juridique",
  "secretariat",
  "archiviste",
  "conseiller",
  "autorite_1",
  "autorite_2",
  "autorite_3",
  "autorite_4",
  "chef_departement",
  "secretaire_direction",
  "collaborateur",
  "dga",
  "daf",
  "dt",
]);

const REGISTRE_ROLES = new Set(["reception", "admin", "superadmin"]);
const REGISTRE_DELETE = new Set(["admin", "superadmin"]);
const ARCHIVES_DOWNLOAD = new Set([
  "secretariat",
  "archiviste",
  "admin",
  "superadmin",
  "dg",
  "directeur",
  "ministre",
  "autorite_1",
  "dircab",
  "dircaba",
  "autorite_2",
  "autorite_3",
  "dga",
]);
const SUIVI_VIEW = new Set([
  "superadmin",
  "admin",
  "secretariat",
  "dg",
  "directeur",
  "ministre",
  "dircab",
  "dircaba",
  "autorite_1",
  "autorite_2",
  "autorite_3",
  "autorite_4",
  "dga",
]);
const MEETINGS_ROLES = new Set([
  "secretariat",
  "dg",
  "directeur",
  "ministre",
  "autorite_1",
  "admin",
  "superadmin",
  "dircab",
  "dircaba",
]);
const WORKFLOW_CONFIG = new Set(["superadmin", "admin"]);
const USERS_ADMIN = new Set(["superadmin", "admin"]);
const INBOX_TREAT = new Set([
  "dg",
  "directeur",
  "ministre",
  "autorite_1",
  "dircab",
  "dircaba",
  "autorite_2",
  "autorite_3",
  "dga",
  "conseiller",
  "conseiller_juridique",
  "autorite_4",
  "secretariat",
  "archiviste",
  "agent",
  "collaborateur",
  "chef_departement",
  "secretaire_direction",
  "superadmin",
  "admin",
]);

/** Comportement legacy (cartographie actuelle) — utilisé pour seed et reset UI. */
export function legacyRoleAllows(role: string, resource: string, action: string): boolean {
  if (role === "superadmin") return true;

  switch (resource) {
    case "registre":
      if (action === "view" || action === "create" || action === "edit" || action === "export") {
        return REGISTRE_ROLES.has(role);
      }
      if (action === "delete") return REGISTRE_DELETE.has(role);
      return false;
    case "inbox":
      if (action === "view") return NON_RECEPTION.has(role);
      if (action === "treat") return INBOX_TREAT.has(role);
      return false;
    case "archives":
      if (action === "view") return NON_RECEPTION.has(role);
      if (action === "download") return ARCHIVES_DOWNLOAD.has(role);
      return false;
    case "suivi":
      return action === "view" && SUIVI_VIEW.has(role);
    case "history":
      return action === "view" && NON_RECEPTION.has(role);
    case "meetings":
      return MEETINGS_ROLES.has(role);
    case "workflow_config":
      return WORKFLOW_CONFIG.has(role);
    case "users":
      return USERS_ADMIN.has(role);
    case "integrations":
      return role === "superadmin";
    default:
      return true;
  }
}

export interface RolePermissionRow {
  role: string;
  resource_key: string;
  action: string;
  is_allowed: boolean;
}

/** Génère les lignes seed pour un rôle (hors superadmin). */
export function buildDefaultPermissionsForRole(role: string): RolePermissionRow[] {
  if (role === "superadmin") return [];
  const rows: RolePermissionRow[] = [];
  for (const res of PERMISSION_RESOURCES) {
    for (const action of res.actions) {
      rows.push({
        role,
        resource_key: res.resource_key,
        action,
        is_allowed: legacyRoleAllows(role, res.resource_key, action),
      });
    }
  }
  return rows;
}

export function buildAllDefaultPermissions(roles: string[]): RolePermissionRow[] {
  return roles.filter((r) => r !== "superadmin").flatMap(buildDefaultPermissionsForRole);
}
