import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Share, Plus, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "pwa-install-guide-dismissed";

export function InstallGuide() {
  const [open, setOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [platform, setPlatform] = useState<"ios" | "android" | "other">("other");

  useEffect(() => {
    // Don't show if already in standalone mode or previously dismissed
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches
      || (navigator as any).standalone === true;
    if (isStandalone || localStorage.getItem(DISMISS_KEY)) return;

    // Detect platform
    const ua = navigator.userAgent;
    if (/iPad|iPhone|iPod/.test(ua)) {
      setPlatform("ios");
      // Show after a short delay
      const timer = setTimeout(() => setOpen(true), 3000);
      return () => clearTimeout(timer);
    } else if (/android/i.test(ua)) {
      setPlatform("android");
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setTimeout(() => setOpen(true), 2000);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setOpen(false);
        localStorage.setItem(DISMISS_KEY, "1");
      }
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setOpen(false);
    localStorage.setItem(DISMISS_KEY, "1");
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleDismiss(); }}>
      <DialogContent className="max-w-sm mx-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5 text-primary" />
            Installer l'application
          </DialogTitle>
          <DialogDescription>
            Accédez plus rapidement à ARE App depuis votre écran d'accueil.
          </DialogDescription>
        </DialogHeader>

        {platform === "ios" ? (
          <div className="space-y-4 text-sm">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm shrink-0">1</div>
              <p>Appuyez sur l'icône <Share className="inline h-4 w-4 mx-1 text-primary" /> <strong>Partager</strong> en bas de Safari</p>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm shrink-0">2</div>
              <p>Faites défiler et appuyez sur <Plus className="inline h-4 w-4 mx-1 text-primary" /> <strong>Sur l'écran d'accueil</strong></p>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm shrink-0">3</div>
              <p>Appuyez sur <strong>Ajouter</strong> pour confirmer</p>
            </div>
            <Button variant="outline" className="w-full" onClick={handleDismiss}>
              <X className="h-4 w-4 mr-2" /> Compris, merci
            </Button>
          </div>
        ) : deferredPrompt ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Installez l'application pour un accès rapide et une expérience plein écran.
            </p>
            <div className="flex gap-3">
              <Button onClick={handleInstall} className="flex-1">
                <Download className="h-4 w-4 mr-2" /> Installer
              </Button>
              <Button variant="outline" onClick={handleDismiss}>
                Plus tard
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 text-sm">
            <p className="text-muted-foreground">
              Pour installer l'application, ouvrez le menu de votre navigateur (⋮) puis sélectionnez <strong>"Installer l'application"</strong> ou <strong>"Ajouter à l'écran d'accueil"</strong>.
            </p>
            <Button variant="outline" className="w-full" onClick={handleDismiss}>
              <X className="h-4 w-4 mr-2" /> Compris
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
