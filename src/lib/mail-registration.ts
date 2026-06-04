/** ID technique auto pour QR / traçabilité (distinct du numéro courrier métier). */
export function generateSystemReference(): string {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `CR-${d}-${rand}`;
}

/** Heure locale HH:mm pour le champ deposit_time. */
export function getDefaultDepositTime(): string {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, "0");
  const m = String(now.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

/** Heure de dépôt effective : saisie utilisateur ou heure courante. */
export function resolveDepositTime(userValue: string | null | undefined): string {
  const trimmed = userValue?.trim();
  if (trimmed) return trimmed;
  return getDefaultDepositTime();
}
