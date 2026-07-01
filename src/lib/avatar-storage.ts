import { supabase } from "@/integrations/supabase/client";

const AVATAR_BUCKET = "avatars";
const SIGNED_URL_TTL_SEC = 60 * 60 * 24 * 7; // 7 jours

/** Chemin Storage à partir d'un path ou d'une ancienne URL publique complète. */
export function toAvatarStoragePath(avatarUrlOrPath: string | null | undefined): string | null {
  if (!avatarUrlOrPath?.trim()) return null;
  const value = avatarUrlOrPath.trim();
  if (!value.includes("://")) return value;

  // Supporte les URLs Supabase (anciens et nouveaux formats), ex:
  // - /storage/v1/object/public/avatars/<path>
  // - /storage/v1/object/sign/avatars/<path>?token=...
  // - /object/public/avatars/<path>
  // - /object/sign/avatars/<path>?...
  const match = value.match(/\/avatars\/([^?]+)(?:\?|$)/);
  if (!match?.[1]) return null;

  try {
    return decodeURIComponent(match[1]);
  } catch {
    // Si l'URL n'est pas encodée correctement, garder brut.
    return match[1];
  }
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

  // IMPORTANT: getPublicUrl() retourne une URL même si l'objet n'existe pas.
  // Pour éviter un faux succès (toast OK mais image 404), on exige une signedUrl valide.
  const { data: signed, error: signedError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SEC);

  if (signedError || !signed?.signedUrl) {
    return {
      error:
        signedError?.message ||
        "Photo enregistrée mais URL inaccessible — vérifiez le bucket/policies avatars (migration AE).",
    };
  }

  const displayUrl = signed.signedUrl;

  return { path, displayUrl };
}
