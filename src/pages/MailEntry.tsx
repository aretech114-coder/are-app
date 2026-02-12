import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { ScanLine, Send, Printer } from "lucide-react";

export default function MailEntry() {
  const { user } = useAuth();
  const [form, setForm] = useState({
    sender_name: "", sender_organization: "", subject: "",
    description: "", priority: "normal" as string,
  });
  const [loading, setLoading] = useState(false);
  const [qrData, setQrData] = useState<{ ref: string; data: string } | null>(null);
  const [showQr, setShowQr] = useState(false);

  const generateRef = () => {
    const date = new Date();
    const d = date.toISOString().slice(0, 10).replace(/-/g, "");
    const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `CR-${d}-${rand}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);

    const ref = generateRef();
    const qrCodeData = JSON.stringify({ ref, date: new Date().toISOString(), agent: user.id });

    try {
      const { error } = await supabase.from("mails").insert({
        reference_number: ref,
        qr_code_data: qrCodeData,
        sender_name: form.sender_name,
        sender_organization: form.sender_organization || null,
        subject: form.subject,
        description: form.description || null,
        priority: form.priority as any,
        registered_by: user.id,
      });

      if (error) throw error;
      setQrData({ ref, data: qrCodeData });
      setShowQr(true);
      toast.success("Courrier enregistré avec succès");
      setForm({ sender_name: "", sender_organization: "", subject: "", description: "", priority: "normal" });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleScan = () => {
    toast.info("Simulation de scan : document capturé avec succès");
  };

  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="page-header">Enregistrement du Courrier</h1>
        <p className="page-description">Saisissez les informations du courrier entrant</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Nouveau Courrier</CardTitle>
          <Button variant="outline" size="sm" onClick={handleScan}>
            <ScanLine className="h-4 w-4 mr-2" />
            Scan Document
          </Button>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Expéditeur *</Label>
                <Input
                  required
                  value={form.sender_name}
                  onChange={(e) => setForm({ ...form, sender_name: e.target.value })}
                  placeholder="Nom de l'expéditeur"
                />
              </div>
              <div className="space-y-2">
                <Label>Organisation</Label>
                <Input
                  value={form.sender_organization}
                  onChange={(e) => setForm({ ...form, sender_organization: e.target.value })}
                  placeholder="Nom de l'organisation"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Objet *</Label>
              <Input
                required
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                placeholder="Objet du courrier"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Description ou résumé du contenu..."
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Priorité</Label>
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Basse</SelectItem>
                  <SelectItem value="normal">Normale</SelectItem>
                  <SelectItem value="high">Haute</SelectItem>
                  <SelectItem value="urgent">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              <Send className="h-4 w-4 mr-2" />
              {loading ? "Enregistrement..." : "Enregistrer le courrier"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Dialog open={showQr} onOpenChange={setShowQr}>
        <DialogContent className="max-w-sm text-center">
          <DialogHeader>
            <DialogTitle>QR Code généré</DialogTitle>
          </DialogHeader>
          {qrData && (
            <div className="flex flex-col items-center gap-4 py-4">
              <QRCodeSVG value={qrData.data} size={180} />
              <p className="text-sm font-mono font-medium">{qrData.ref}</p>
              <p className="text-xs text-muted-foreground">
                Enregistré le {new Date().toLocaleString("fr-FR")}
              </p>
              <Button variant="outline" size="sm" onClick={() => window.print()}>
                <Printer className="h-4 w-4 mr-2" />
                Imprimer l'étiquette
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
