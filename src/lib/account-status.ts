export const NEW_APP_URL = "https://new.are-app.cloud";

export const MAINTENANCE_OPEN_PATHS = ["/auth", "/reset-password", "/auth/callback", "/maintenance"] as const;

export function isPrivilegedAccountRole(role: string | null | undefined): boolean {
  return role === "admin" || role === "superadmin";
}

export function isMaintenanceEnabled(value: string | undefined | null): boolean {
  return value === "true";
}

/** Vide → nouvelle plateforme ; "login" ou "/auth" → page de connexion ; sinon URL externe. */
export function resolveMaintenanceButtonTarget(
  raw: string | undefined | null
): { kind: "login" } | { kind: "external"; url: string } {
  const trimmed = (raw || "").trim();
  const v = trimmed.toLowerCase();
  if (v === "login" || v === "/auth") {
    return { kind: "login" };
  }
  if (!trimmed) {
    return { kind: "external", url: NEW_APP_URL };
  }
  return { kind: "external", url: trimmed };
}
