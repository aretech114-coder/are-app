export const NEW_APP_URL = "https://new.are-app.cloud";

export const MAINTENANCE_OPEN_PATHS = ["/auth", "/reset-password", "/auth/callback", "/maintenance"] as const;

export function isPrivilegedAccountRole(role: string | null | undefined): boolean {
  return role === "admin" || role === "superadmin";
}

export function isMaintenanceEnabled(value: string | undefined | null): boolean {
  return value === "true";
}
