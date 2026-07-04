const KEY_PREFIX = "are_avatar_src:";

interface PersistedAvatar {
  path: string;
  src: string;
  ts: number;
}

export function persistAvatarSrc(userId: string, avatarPath: string, src: string): void {
  if (typeof window === "undefined") return;
  try {
    const payload: PersistedAvatar = { path: avatarPath, src, ts: Date.now() };
    sessionStorage.setItem(`${KEY_PREFIX}${userId}`, JSON.stringify(payload));
  } catch {
    // quota / private mode
  }
}

export function loadPersistedAvatarSrc(userId: string, avatarPath?: string | null): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(`${KEY_PREFIX}${userId}`);
    if (!raw) return null;
    const data = JSON.parse(raw) as PersistedAvatar;
    if (!data?.src) return null;
    if (avatarPath && data.path !== avatarPath) return null;
    return data.src;
  } catch {
    return null;
  }
}

export function clearPersistedAvatarSrc(userId: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(`${KEY_PREFIX}${userId}`);
  } catch {
    // ignore
  }
}
