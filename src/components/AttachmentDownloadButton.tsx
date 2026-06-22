import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createSignedUrlForPath, type MailStorageBucket } from "@/lib/mail-storage";

interface AttachmentDownloadButtonProps {
  url?: string | null;
  name?: string;
  bucket?: MailStorageBucket | string | null;
  path?: string | null;
  variant?: "ghost" | "outline" | "default";
  size?: "sm" | "icon" | "default";
  className?: string;
  label?: string;
}

export function fileNameFromUrl(url: string, fallback: string): string {
  try {
    const pathname = new URL(url).pathname;
    const base = pathname.split("/").pop();
    if (base && base.length > 0) return decodeURIComponent(base);
  } catch {
    /* ignore */
  }
  return fallback;
}

export function AttachmentDownloadButton({
  url,
  name,
  bucket,
  path,
  variant = "outline",
  size = "sm",
  className,
  label,
}: AttachmentDownloadButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setLoading(true);
    try {
      await downloadAttachmentItem({ url, name, bucket, path });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur de téléchargement";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  if (!url && !(bucket && path)) return null;

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      disabled={loading}
      onClick={handleDownload}
      title="Télécharger"
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Download className="h-3.5 w-3.5" />
      )}
      {label && size !== "icon" && <span className="ml-1.5">{label}</span>}
    </Button>
  );
}

export async function downloadAttachmentItem(params: {
  url?: string | null;
  name?: string;
  bucket?: MailStorageBucket | string | null;
  path?: string | null;
}): Promise<void> {
  let downloadUrl = params.url?.trim() || "";
  if (params.bucket && params.path) {
    downloadUrl = await createSignedUrlForPath(params.bucket as MailStorageBucket, params.path);
  }
  if (!downloadUrl) {
    throw new Error("URL de téléchargement indisponible");
  }

  const fileName = params.name || fileNameFromUrl(downloadUrl, "piece-jointe");
  const response = await fetch(downloadUrl);
  if (!response.ok) throw new Error("Téléchargement impossible");
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}
