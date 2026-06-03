/** Rôles SQL conservés en base mais masqués dans les écrans d'administration. */
export const HIDDEN_APP_ROLES = ["ministre"] as const;

export function isHiddenAppRole(role: string): boolean {
  return (HIDDEN_APP_ROLES as readonly string[]).includes(role);
}

export function filterVisibleRoleOptions<T extends { value: string }>(roles: T[]): T[] {
  return roles.filter((r) => !isHiddenAppRole(r.value));
}
