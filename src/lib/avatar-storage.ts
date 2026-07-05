import { supabase } from "@/integrations/supabase/client";
import { avatarDisplayUrl } from "@/lib/avatar-url";

const AVATAR_BUCKET = "avatars";
const SIGNED_URL_TTL_SEC = 60 * 60 * 24 * 7;
const VERIFY_RETRY_DELAY_MS = 200;

export const AVATAR_MAX_PX = 512;
export const AVATAR_JPEG_QUALITY = 0.8;
export const AVATAR_MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

const ACCEPTED_AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const REJECTED_EXTENSIONS = new Set(["heic", "heif", "avif", "gif", "bmp", "tiff", "tif"]);

const resolvedSrcCache = new Map<string, string>();
const inFlightResolves = new Map<string, Promise<string | undefined>>();

function srcCacheKey(path: string, version?: string | number | null): string {
  return `${path}|${version ?? ""}`;
}

export function avatarStoragePathForUser(userId: string): string {
  return `${userId}/avatar.jpg`;
}

/** Chemin Storage à partir d'un path ou d'une ancienne URL publique complète. */
export function toAvatarStoragePath(avatarUrlOrPath: string | null | undefined): string | null {
  if (!avatarUrlOrPath?.trim()) return null;
  const value = avatarUrlOrPath.trim();
  if (!value.includes("://")) return value;

  const match = value.match(/\/avatars\/([^?]+)(?:\?|$)/);
  if (!match?.[1]) return null;

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export function getAvatarPublicSrc(path: string, version?: string | number | null): string {
  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  return avatarDisplayUrl(data.publicUrl, version) ?? data.publicUrl;
}

export function invalidateAvatarSrcCache(path?: string): void {
  if (!path) {
    resolvedSrcCache.clear();
    inFlightResolves.clear();
    return;
  }

  const prefix = `${path}|`;
  for (const key of resolvedSrcCache.keys()) {
    if (key === path || key.startsWith(prefix)) {
      resolvedSrcCache.delete(key);
    }
  }
  for (const key of inFlightResolves.keys()) {
    if (key.startsWith(prefix)) {
      inFlightResolves.delete(key);
    }
  }
}

/** Enregistre une URL déjà vérifiée (ex. juste après upload). */
export function seedAvatarSrcCache(
  path: string,
  version: string | number | null | undefined,
  src: string
): void {
  resolvedSrcCache.set(srcCacheKey(path, version), src);
}

/** Teste si une URL d'image est chargeable dans le navigateur. */
export function tryLoadImage(url: string, timeoutMs = 12_000): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve(false);
      return;
    }
    const img = new Image();
    const timer = window.setTimeout(() => resolve(false), timeoutMs);
    img.onload = () => {
      window.clearTimeout(timer);
      resolve(img.naturalWidth > 0 && img.naturalHeight > 0);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      resolve(false);
    };
    img.src = url;
  });
}

async function createSignedAvatarSrc(
  path: string,
  version?: string | number | null
): Promise<string | undefined> {
  const { data: signed, error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SEC);

  if (error || !signed?.signedUrl) return undefined;
  return avatarDisplayUrl(signed.signedUrl, version) ?? signed.signedUrl;
}

/** Signed URL pour fallback d'affichage (dernier recours dans UserAvatar). */
export async function getAvatarSignedSrc(
  avatarUrlOrPath: string,
  version?: string | number | null
): Promise<string | undefined> {
  const path = toAvatarStoragePath(avatarUrlOrPath) ?? avatarUrlOrPath;
  return createSignedAvatarSrc(path, version);
}

export async function verifyAvatarReadable(
  path: string,
  version?: string | number | null,
  retries = 1
): Promise<{ ok: true; src: string } | { ok: false; error: string }> {
  const attempt = async (): Promise<{ ok: true; src: string } | { ok: false; error: string }> => {
    const publicSrc = getAvatarPublicSrc(path, version);
    if (await tryLoadImage(publicSrc)) {
      return { ok: true, src: publicSrc };
    }

    const signedSrc = await createSignedAvatarSrc(path, version);
    if (signedSrc && (await tryLoadImage(signedSrc))) {
      return { ok: true, src: signedSrc };
    }

    return {
      ok: false,
      error:
        "Photo enregistrée mais illisible — vérifiez le bucket avatars (migration AE/AH) ou réessayez.",
    };
  };

  let result = await attempt();
  if (result.ok || retries <= 0) return result;

  await new Promise((resolve) => setTimeout(resolve, VERIFY_RETRY_DELAY_MS));
  return attempt();
}

export function validateAvatarFile(file: File): string | null {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (REJECTED_EXTENSIONS.has(ext)) {
    return "Format non pris en charge. Utilisez JPEG, PNG ou WebP (exportez depuis votre galerie si besoin).";
  }
  if (!ACCEPTED_AVATAR_TYPES.has(file.type) && !["jpg", "jpeg", "png", "webp"].includes(ext)) {
    return "Utilisez une image JPEG, PNG ou WebP.";
  }
  if (file.size > AVATAR_MAX_UPLOAD_BYTES) {
    return `La photo dépasse 2 Mo (${Math.round(file.size / (1024 * 1024))} Mo). Choisissez une image plus légère.`;
  }
  return null;
}

/** Redimensionne en JPEG 512px max (~100–200 Ko cible). */
export async function compressAvatarImage(file: File): Promise<File> {
  const validationError = validateAvatarFile(file);
  if (validationError) {
    throw new Error(validationError);
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;
      if (width > AVATAR_MAX_PX || height > AVATAR_MAX_PX) {
        if (width >= height) {
          height = Math.round((height * AVATAR_MAX_PX) / width);
          width = AVATAR_MAX_PX;
        } else {
          width = Math.round((width * AVATAR_MAX_PX) / height);
          height = AVATAR_MAX_PX;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Impossible de traiter l'image"));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob || blob.size === 0) {
            reject(new Error("Impossible de compresser l'image"));
            return;
          }
          resolve(new File([blob], "avatar.jpg", { type: "image/jpeg", lastModified: Date.now() }));
        },
        "image/jpeg",
        AVATAR_JPEG_QUALITY
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Impossible de lire l'image sélectionnée"));
    };

    img.src = url;
  });
}

/** Résout avatar_url en src affichable (public → signed URL si besoin). */
export async function resolveAvatarSrc(
  avatarUrlOrPath: string | null | undefined,
  version?: string | number | null
): Promise<string | undefined> {
  const path = toAvatarStoragePath(avatarUrlOrPath);
  if (!path) return undefined;

  const key = srcCacheKey(path, version);
  const cached = resolvedSrcCache.get(key);
  if (cached) return cached;

  const inFlight = inFlightResolves.get(key);
  if (inFlight) return inFlight;

  const promise = (async (): Promise<string | undefined> => {
    const publicSrc = getAvatarPublicSrc(path, version);
    if (await tryLoadImage(publicSrc)) {
      resolvedSrcCache.set(key, publicSrc);
      return publicSrc;
    }

    const signedSrc = await createSignedAvatarSrc(path, version);
    if (signedSrc && (await tryLoadImage(signedSrc))) {
      resolvedSrcCache.set(key, signedSrc);
      return signedSrc;
    }

    return signedSrc ?? publicSrc;
  })();

  inFlightResolves.set(key, promise);
  try {
    return await promise;
  } finally {
    inFlightResolves.delete(key);
  }
}

export async function uploadUserAvatar(
  userId: string,
  file: File
): Promise<{ path: string; src: string } | { error: string }> {
  let prepared: File;
  try {
    prepared = await compressAvatarImage(file);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Impossible de préparer l'image" };
  }

  const path = avatarStoragePathForUser(userId);

  const { error: uploadError } = await supabase.storage.from(AVATAR_BUCKET).upload(path, prepared, {
    upsert: true,
    contentType: "image/jpeg",
    cacheControl: "86400",
  });

  if (uploadError) {
    const hint = uploadError.message.includes("policy") || uploadError.message.includes("403")
      ? " — vérifiez les migrations AE/AH (bucket avatars public)."
      : "";
    return { error: uploadError.message + hint };
  }

  const { data: listed, error: listError } = await supabase.storage.from(AVATAR_BUCKET).list(userId, {
    search: "avatar.jpg",
  });

  if (listError) {
    return {
      error:
        listError.message +
        " — photo peut-être enregistrée ; vérifiez le bucket avatars (migration AE/AH).",
    };
  }

  const exists = listed?.some((o) => o.name === "avatar.jpg");
  if (!exists) {
    return {
      error:
        "Photo enregistrée mais introuvable dans le stockage — vérifiez le bucket avatars (migration AE/AH).",
    };
  }

  const version = Date.now();
  const verify = await verifyAvatarReadable(path, version, 1);
  if (!verify.ok) {
    return { error: verify.error };
  }

  seedAvatarSrcCache(path, version, verify.src);
  return { path, src: verify.src };
}

/** Persiste avatar_url via RPC SECURITY DEFINER (fiable même si RLS UPDATE silencieux). */
export async function persistProfileAvatarPath(
  userId: string,
  storagePath: string
): Promise<{ avatar_url: string; updated_at: string } | { error: string }> {
  const expected = avatarStoragePathForUser(userId);
  if (storagePath !== expected) {
    return { error: "Chemin avatar invalide" };
  }

  const { data, error } = await supabase.rpc("update_profile_avatar", {
    _storage_path: storagePath,
  });

  if (error) {
    return { error: error.message };
  }

  const result = data as {
    success?: boolean;
    error?: string;
    avatar_url?: string;
    updated_at?: string;
  };

  if (!result?.success || !result.avatar_url) {
    return {
      error:
        result?.error ||
        "Impossible de mettre à jour le profil — appliquez la migration AL (update_profile_avatar).",
    };
  }

  return {
    avatar_url: result.avatar_url,
    updated_at: result.updated_at ?? new Date().toISOString(),
  };
}

/** Précharge l'image en cache navigateur (profil courant). */
export function prefetchAvatarSrc(
  avatarUrlOrPath: string | null | undefined,
  version?: string | number | null
): void {
  if (typeof window === "undefined") return;
  void resolveAvatarSrc(avatarUrlOrPath, version).then((src) => {
    if (!src) return;
    const img = new Image();
    img.src = src;
  });
}
