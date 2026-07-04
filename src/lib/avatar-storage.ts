import { supabase } from "@/integrations/supabase/client";
import { avatarDisplayUrl } from "@/lib/avatar-url";

const AVATAR_BUCKET = "avatars";
const SIGNED_URL_TTL_SEC = 60 * 60 * 24 * 7;

export const AVATAR_MAX_PX = 512;
export const AVATAR_JPEG_QUALITY = 0.8;
export const AVATAR_MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

const ACCEPTED_AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const REJECTED_EXTENSIONS = new Set(["heic", "heif", "avif", "gif", "bmp", "tiff", "tif"]);

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
          if (!blob) {
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

/** Fallback async si bucket privé legacy — préférer getAvatarPublicSrc. */
export async function resolveAvatarSrc(
  avatarUrlOrPath: string | null | undefined,
  version?: string | number | null
): Promise<string | undefined> {
  const path = toAvatarStoragePath(avatarUrlOrPath);
  if (!path) return undefined;

  const publicSrc = getAvatarPublicSrc(path, version);

  try {
    const res = await fetch(publicSrc, { method: "HEAD" });
    if (res.ok) return publicSrc;
  } catch {
    // fallback signed URL below
  }

  const { data: signed, error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SEC);

  if (!error && signed?.signedUrl) {
    return avatarDisplayUrl(signed.signedUrl, version);
  }

  return publicSrc;
}

export async function uploadUserAvatar(
  userId: string,
  file: File
): Promise<{ path: string } | { error: string }> {
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

  return { path };
}

/** Précharge l'image en cache navigateur (profil courant). */
export function prefetchAvatarSrc(avatarUrlOrPath: string | null | undefined, version?: string | number | null): void {
  const path = toAvatarStoragePath(avatarUrlOrPath);
  if (!path || typeof window === "undefined") return;
  const img = new Image();
  img.src = getAvatarPublicSrc(path, version);
}
