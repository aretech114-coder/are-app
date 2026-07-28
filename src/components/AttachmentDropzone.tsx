import { Paperclip, Upload, X, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type AttachmentDropzoneItem = {
  id: string;
  name: string;
  size?: number;
  status?: "ready" | "uploading" | "done" | "error";
  error?: string | null;
};

interface AttachmentDropzoneProps {
  items: AttachmentDropzoneItem[];
  onAddFiles: (files: FileList | null) => void;
  onRemove: (id: string) => void;
  hint?: string;
  maxLabel?: string;
  emptyLabel?: string;
  className?: string;
  multiple?: boolean;
  disabled?: boolean;
}

function formatFileSize(size?: number) {
  if (!size) return null;
  if (size < 1024) return `${size} o`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} Ko`;
  return `${(size / (1024 * 1024)).toFixed(1)} Mo`;
}

export function AttachmentDropzone({
  items,
  onAddFiles,
  onRemove,
  hint,
  maxLabel,
  emptyLabel = "Glisser-déposer ou cliquer pour joindre un ou plusieurs fichiers.",
  className,
  multiple = true,
  disabled = false,
}: AttachmentDropzoneProps) {
  return (
    <div className={cn("space-y-2", className)}>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <div
        className={cn(
          "border-2 border-dashed border-border rounded-lg p-4 text-center transition-colors",
          disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-primary/50"
        )}
        onDragOver={(e) => {
          if (disabled) return;
          e.preventDefault();
        }}
        onDrop={(e) => {
          if (disabled) return;
          e.preventDefault();
          onAddFiles(e.dataTransfer.files);
        }}
        onClick={() => {
          if (disabled) return;
          const input = document.createElement("input");
          input.type = "file";
          input.multiple = multiple;
          input.onchange = () => onAddFiles(input.files);
          input.click();
        }}
      >
        <Upload className="h-5 w-5 mx-auto text-primary mb-1.5" />
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
        {maxLabel && <p className="text-xs text-muted-foreground mt-2">{maxLabel}</p>}
      </div>
      {items.length > 0 && (
        <div className="space-y-1">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-2 rounded border bg-background px-2 py-1.5 text-xs"
            >
              <span className="min-w-0 flex items-center gap-2 truncate">
                {item.status === "uploading" ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
                ) : item.status === "done" ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600" />
                ) : item.status === "error" ? (
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
                ) : (
                  <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className="truncate">{item.name}</span>
                {item.size ? (
                  <span className="shrink-0 text-muted-foreground">({formatFileSize(item.size)})</span>
                ) : null}
                {item.status === "done" ? (
                  <span className="shrink-0 text-green-600">Importé</span>
                ) : null}
                {item.status === "error" && item.error ? (
                  <span className="truncate text-destructive">{item.error}</span>
                ) : null}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                disabled={disabled || item.status === "uploading"}
                onClick={() => onRemove(item.id)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
