import { supabase } from "@/integrations/supabase/client";

const AVATAR_BUCKET = "avatars";
const SIGNED_URL_TTL_SEC = 60 * 60 * 24 * 7; // 7 jours

/** Chemin Storage à partir d'un path ou d'une ancienne URL publique complète. */
export function toAvatarStoragePath(avatarUrlOrPath: string | null | undefined): string | null {
  if (!avatarUrlOrPath?.trim()) return null;
  const value = avatarUrlOrPath.trim();
  if (!value.includes("://")) return value;

  const markers = ["/object/public/avatars/", "/object/sign/avatars/"];
  for (const marker of markers) {
    const idx = value.indexOf(marker);
    if (idx !== -1) {
      return decodeURIComponent(value.slice(idx + marker.length).split("?")[0] ?? "");
    }
  }
  return null;
}

/** URL affichable (signée si besoin) — fonctionne bucket public ou privé. */
export async function resolveAvatarSrc(
  avatarUrlOrPath: string | null | undefined
): Promise<string | undefined> {
  const path = toAvatarStoragePath(avatarUrlOrPath);
  if (!path) return undefined;

  const { data: signed, error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SEC);

  if (!error && signed?.signedUrl) {
    return signed.signedUrl;
  }

  const { data: pub } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  return pub.publicUrl || undefined;
}

export async function uploadUserAvatar(
  userId: string,
  file: File
): Promise<{ path: string; displayUrl: string } | { error: string }> {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${userId}/avatar.${ext}`;

  const { error: uploadError } = await supabase.storage.from(AVATAR_BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type || `image/${ext === "jpg" ? "jpeg" : ext}`,
    cacheControl: "3600",
  });

  if (uploadError) {
    return { error: uploadError.message };
  }

  const displayUrl = (await resolveAvatarSrc(path)) ?? "";
  if (!displayUrl) {
    return { error: "Photo enregistrée mais URL inaccessible — vérifiez le bucket avatars (migration AD)." };
  }

  return { path, displayUrl };
}
